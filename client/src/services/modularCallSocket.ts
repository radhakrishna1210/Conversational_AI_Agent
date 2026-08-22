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
  // sttEndpointing: the server has model-based (Deepgram) endpointing available,
  // so the client's RMS VAD is a backstop rather than the sole endpointer. It
  // must then use a LONGER silence timeout, otherwise it cuts the caller off
  // mid-sentence before the smarter signal gets to rule on the turn.
  // endpointCommitMs: worst-case ms of silence before the SERVER ends a turn on
  // its own. The client's RMS backstop is derived from this so the two cannot
  // race — if the backstop fires first, the server's grace window is dead code.
  // noInputPrompts / noInputDelaysMs: what to say, in the agent's language, when
  // the caller has gone quiet, and how long to wait before each. Resolved by the
  // server (only it can see agent.languages) and shipped up front, because the
  // feature exists to break dead air on a deadline — it must not need a round
  // trip at the moment it fires.
  | {
      type: 'ready';
      sttEndpointing?: boolean;
      endpointCommitMs?: number;
      noInputPrompts?: string[];
      noInputDelaysMs?: number[];
    }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; done: boolean }
  // B4 streaming reply audio: a JSON audio-start opens the stream, raw binary
  // frames carry the audio bytes, an audio-end JSON frame closes it.
  | { type: 'audio-start'; contentType: string | null }
  | { type: 'audio-chunk'; data: ArrayBuffer }
  | { type: 'audio-end' }
  // Semantic turn end: Deepgram detected the caller finished speaking — the
  // client ends the current listening turn now instead of waiting for its VAD.
  | { type: 'endpoint' }
  | { type: 'done'; reply?: string | null; timings?: { sttMs: number; llmMs: number; ttsMs: number; ttfaMs: number; totalMs: number } | null }
  // `code` is set when the server refused or ended the call for a specific
  // reason it wants named — INSUFFICIENT_BALANCE (wallet empty or spent) and
  // BALANCE_LOW (a heads-up, the call is still running).
  | { type: 'error'; code?: string; message: string };

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
      // Why the server is about to hang up. A refusal arrives as an error frame
      // followed immediately by a close, and without remembering it the close
      // handler could only offer "could not connect" — which is exactly wrong
      // for the most common refusal, an empty wallet, where the connection was
      // fine and the user needs to be told to add funds.
      //
      // Only TERMINAL reasons are latched. A per-turn failure mid-call is
      // already shown when it happens and the call carries on, so keeping it
      // here would make a perfectly normal hangup, minutes later, report a stale
      // error as the reason the call ended.
      let serverError: string | null = null;
      const TERMINAL_CODES = ['INSUFFICIENT_BALANCE'];

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
        if (msg.type === 'error' && msg.message && (!settled || TERMINAL_CODES.includes(msg.code || ''))) {
          serverError = msg.message;
        }
        onEvent(msg);
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(serverError || 'Could not connect to the modular Web Call'));
        }
      };

      socket.onclose = () => {
        // A close that beats `ready` is a refusal, not a hangup — reject with
        // whatever the server said so the caller shows the real reason.
        if (!settled) {
          settled = true;
          reject(new Error(serverError || 'The Web Call could not be started'));
          return;
        }
        onEvent({ type: 'error', message: serverError || 'Call ended' });
      };
    });
  }

  private sendJson(obj: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(obj));
  }

  /** Send one binary PCM16 frame of caller audio (only while a turn is capturing). */
  sendPcm(buf: ArrayBuffer) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(buf);
  }

  /**
   * Hand the server the Recent Calls row this call is being logged against.
   *
   * The browser owns that row — it creates it, PATCHes the transcript per turn
   * and ends it — which meant a closed tab took the end of the call with it: the
   * call was served but never finalized and never billed. Telling the server the
   * id lets it close the call out on its own if this page disappears. It is a
   * backstop, not a handover: when the tab survives, the client's own terminal
   * PATCH still wins and the server does nothing.
   */
  attachCallLog(callLogId: string) { this.sendJson({ type: 'call-log', callLogId }); }

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
