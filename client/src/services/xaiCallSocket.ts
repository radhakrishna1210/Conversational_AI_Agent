/**
 * XaiCallSocket — Web Call transport for agents with voiceEngine === 'xai' or
 * 'elevenlabs' (name kept from the original xAI-only version; engine-agnostic
 * despite the name — it just streams PCM to the server, which picks the
 * actual bundled engine from the agent's saved voiceEngine).
 * Replaces the modular pipeline's record-a-segment-then-POST flow
 * (see EditAgent.tsx startListeningSegment/submitVoiceTurn) with a
 * persistent WebSocket carrying continuous PCM16 @ 24kHz audio, bridged
 * server-side to the bundled speech-to-speech engine
 * (backend/src/ws/webCallRealtime.handler.js).
 *
 * Auth: the socket connects unauthenticated; the first message sent is
 * `{ type: 'auth', token }` (mirrors the server's documented handshake —
 * this app never puts bearer tokens in a WS query string).
 */

export type XaiCallEvent =
  | { type: 'ready' }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; done: boolean }
  | { type: 'error'; message: string };

const SAMPLE_RATE = 24000;

class XaiCallSocketService {
  private socket: WebSocket | null = null;
  private micContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micNode: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackTime = 0;
  // Sources scheduled ahead on the playback clock, tracked so barge-in can stop
  // them instantly (see clearPlayback). Without this, cancelled agent audio
  // that was already queued keeps playing for seconds after an interruption.
  private scheduledSources: AudioBufferSourceNode[] = [];

  private wsUrl(workspaceId: string, agentId: string): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/v1/workspaces/${workspaceId}/agents/${agentId}/xai-call`;
  }

  /** Opens the mic + socket and starts streaming. Resolves once the server confirms `ready`. */
  async start(
    workspaceId: string,
    agentId: string,
    token: string,
    onEvent: (e: XaiCallEvent) => void
  ): Promise<void> {
    // echoCancellation keeps the mic from re-capturing the agent's own voice
    // from the speakers — essential for barge-in, or the agent interrupts itself.
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.micContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.micContext.audioWorklet.addModule('/xai-mic-worklet.js');
    this.micSource = this.micContext.createMediaStreamSource(this.micStream);
    this.micNode = new AudioWorkletNode(this.micContext, 'xai-mic-capture');
    this.micSource.connect(this.micNode);

    this.playbackContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.playbackTime = this.playbackContext.currentTime;

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl(workspaceId, agentId));
      socket.binaryType = 'arraybuffer';
      this.socket = socket;

      let settled = false;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.playPcm16(event.data);
          return;
        }
        let msg: XaiCallEvent | null = null;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (!msg) return;

        // Barge-in: server says the agent was interrupted — drop queued audio
        // so it stops immediately. Internal control frame; not surfaced to UI.
        if ((msg as { type: string }).type === 'clear') {
          this.clearPlayback();
          return;
        }

        if (msg.type === 'ready' && this.micNode) {
          this.micNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
          };
          if (!settled) {
            settled = true;
            resolve();
          }
        }
        onEvent(msg);
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not connect to the xAI Conversational Agent'));
        }
      };

      socket.onclose = () => {
        onEvent({ type: 'error', message: 'Call ended' });
      };
    });
  }

  /** Schedules a PCM16 chunk for gapless playback (queued back-to-back on the AudioContext clock). */
  private playPcm16(buf: ArrayBuffer) {
    if (!this.playbackContext) return;
    const int16 = new Int16Array(buf);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    const audioBuffer = this.playbackContext.createBuffer(1, float32.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const src = this.playbackContext.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.playbackContext.destination);

    const now = this.playbackContext.currentTime;
    const startAt = Math.max(now, this.playbackTime);
    src.start(startAt);
    this.playbackTime = startAt + audioBuffer.duration;

    // Track for barge-in and self-clean when finished so the list can't grow
    // unbounded over a long call.
    this.scheduledSources.push(src);
    src.onended = () => {
      const i = this.scheduledSources.indexOf(src);
      if (i !== -1) this.scheduledSources.splice(i, 1);
    };
  }

  /** Barge-in: stop everything queued and reset the clock so nothing lingers. */
  private clearPlayback() {
    for (const src of this.scheduledSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped/ended */
      }
    }
    this.scheduledSources = [];
    if (this.playbackContext) this.playbackTime = this.playbackContext.currentTime;
  }

  stop() {
    this.socket?.close(1000, 'Call ended by user');
    this.socket = null;
    this.micNode?.disconnect();
    this.micNode = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micContext?.close().catch(() => {});
    this.micContext = null;
    this.playbackContext?.close().catch(() => {});
    this.playbackContext = null;
    this.playbackTime = 0;
    this.scheduledSources = [];
  }

  isActive(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

export const xaiCallSocket = new XaiCallSocketService();
