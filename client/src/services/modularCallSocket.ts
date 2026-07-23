/**
 * ModularCallSocket — Web Call transport for the modular ("combined sources":
 * STT + LLM + TTS) agent (voiceEngine === 'modular'). B2: replaces the
 * record-a-segment-then-HTTP-POST turn flow (EditAgent.tsx submitVoiceTurn*)
 * with ONE persistent WebSocket per call.
 *
 * Division of labour (kept deliberately thin so the client's existing call
 * recording / ambient sound / barge-in stay intact):
 *  - the CLIENT owns endpointing (analyser VAD), the conversation history, and
 *    the Recent Calls log;
 *  - this socket just streams the caller's raw PCM16 up (live, while they
 *    speak — no webm encode, no per-turn upload) and receives the reply back
 *    sentence-by-sentence from the server's voiceTurnStream pipeline.
 *
 * Server bridge: backend/src/ws/webCallModularRealtime.handler.js
 */

export type ModularCallEvent =
  | { type: 'ready' }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; done: boolean }
  // B4 streaming reply audio: a JSON audio-start opens the stream, raw binary
  // frames carry the audio bytes, an audio-end JSON frame closes it.
  | { type: 'audio-start'; contentType: string | null }
  | { type: 'audio-chunk'; data: ArrayBuffer }
  | { type: 'audio-end' }
  | { type: 'done'; reply?: string | null; timings?: { sttMs: number; llmMs: number; ttsMs: number; ttfaMs: number; totalMs: number } | null }
  | { type: 'error'; message: string };

class ModularCallSocketService {
  private socket: WebSocket | null = null;

  private wsUrl(workspaceId: string, agentId: string): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/v1/workspaces/${workspaceId}/agents/${agentId}/web-call`;
  }

  /** Opens the socket and resolves once the server confirms `ready`. */
  start(
    workspaceId: string,
    agentId: string,
    token: string,
    onEvent: (e: ModularCallEvent) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl(workspaceId, agentId));
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      let settled = false;

      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token }));

      socket.onmessage = (event) => {
        // Binary frames are raw reply-audio bytes (between audio-start/audio-end).
        if (event.data instanceof ArrayBuffer) {
          onEvent({ type: 'audio-chunk', data: event.data });
          return;
        }
        // Everything else is a JSON control/text frame.
        let msg: ModularCallEvent | null = null;
        try { msg = JSON.parse(event.data as string); } catch { return; }
        if (!msg) return;
        if (msg.type === 'ready' && !settled) { settled = true; resolve(); }
        onEvent(msg);
      };

      socket.onerror = () => {
        if (!settled) { settled = true; reject(new Error('Could not connect to the modular Web Call')); }
      };

      socket.onclose = () => onEvent({ type: 'error', message: 'Call ended' });
    });
  }

  private sendJson(obj: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(obj));
  }

  /** Send one binary PCM16 frame of caller audio (only while a turn is capturing). */
  sendPcm(buf: ArrayBuffer) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(buf);
  }

  startTurn(sampleRate: number) { this.sendJson({ type: 'start-turn', sampleRate }); }
  endTurn(history: { role: string; content: string }[]) { this.sendJson({ type: 'end-turn', history }); }
  cancelTurn() { this.sendJson({ type: 'cancel-turn' }); }
  barge() { this.sendJson({ type: 'barge' }); }

  stop() {
    try { this.sendJson({ type: 'stop' }); } catch { /* socket already gone */ }
    this.socket?.close(1000, 'Call ended by user');
    this.socket = null;
  }

  isActive(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

export const modularCallSocket = new ModularCallSocketService();
