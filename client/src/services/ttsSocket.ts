/**
 * TTSSocket Service
 * Centralized logic for managing real-time TTS streaming via WebSockets.
 *
 * Control message protocol (JSON strings from server):
 *   { event: "stream_start" }  → server has begun synthesis
 *   { event: "stream_end"   }  → server has sent all chunks
 *   { error:  "<message>"   }  → synthesis failed
 * Binary frames → raw WAV audio chunks, decoded immediately by audioPlayer
 */

class TTSSocketService {
  private socket: WebSocket | null = null;
  private readonly url = "ws://127.0.0.1:8000/ws/tts";

  private autoReconnect = true;
  private reconnectAttempts = 0;
  private readonly maxReconnectInterval = 30000;
  private readonly baseReconnectInterval = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private onAudioChunk: ((chunk: ArrayBuffer) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onEnd: (() => void) | null = null;

  // Request Queue for messages sent before connection is ready
  private sendQueue: string[] = [];

  // Latency tracking
  private requestSentAt = 0;

  /**
   * Initialize and connect to the TTS WebSocket.
   */
  connect(
    onAudioChunk: (chunk: ArrayBuffer) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ) {
    // Update callbacks (even if already connected, we want the latest listeners)
    this.onAudioChunk = onAudioChunk;
    this.onError = onError || null;
    this.onEnd = onEnd || null;
    this.autoReconnect = true;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log(`[TTS WS] Connecting to ${this.url}...`);
    this.socket = new WebSocket(this.url);
    this.socket.binaryType = "arraybuffer";

    this.socket.onopen = () => {
      console.log("[TTS WS] Connected successfully.");
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
      this.startHeartbeat();
      this.flushQueue();
    };

    this.socket.onmessage = (event) => {
      // ── Binary frame: audio chunk ──────────────────────────────────────────
      if (event.data instanceof ArrayBuffer) {
        if (this.requestSentAt > 0) {
          const latency = (performance.now() - this.requestSentAt).toFixed(0);
          console.log(`[TTS WS] First chunk received in ${latency}ms`);
          this.requestSentAt = 0;
        }
        if (this.onAudioChunk) this.onAudioChunk(event.data);
        return;
      }

      // ── Text frame: control message ────────────────────────────────────────
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data);
          if (message.error) {
            console.error("[TTS WS] Server error:", message.error);
            if (this.onError) this.onError(message.error);
          } else if (message.event === "stream_end") {
            if (this.onEnd) this.onEnd();
          } else if (message.event === "pong") {
            // Heartbeat acknowledged
          }
        } catch {
          // Non-JSON text frames are ignored
        }
      }
    };

    this.socket.onerror = (error) => {
      console.error("[TTS WS] Socket error:", error);
    };

    this.socket.onclose = (event) => {
      this.socket = null;
      this.stopHeartbeat();
      
      console.log(`[TTS WS] Connection closed (code: ${event.code}).`);

      if (this.autoReconnect && event.code !== 1000) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      this.baseReconnectInterval * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectInterval
    );
    
    console.log(`[TTS WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      if (this.onAudioChunk) {
        this.connect(this.onAudioChunk, this.onError || undefined, this.onEnd || undefined);
      }
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.socket?.send(JSON.stringify({ event: "ping" }));
      }
    }, 30000); // 30s heartbeat
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    
    while (this.sendQueue.length > 0) {
      const payload = this.sendQueue.shift();
      if (payload) {
        this.socket.send(payload);
        console.log("[TTS WS] Flushed queued request.");
      }
    }
  }

  /**
   * Send text to be synthesised. If disconnected, the request is queued.
   */
  sendText(text: string, voice = "female") {
    const payload = JSON.stringify({ text, voice });
    this.requestSentAt = performance.now();

    if (this.isConnected()) {
      this.socket?.send(payload);
      console.log(`[TTS WS] Request sent: "${text.substring(0, 30)}..."`);
    } else {
      console.log("[TTS WS] Socket not ready. Queuing request...");
      this.sendQueue.push(payload);
      // Try to connect if we aren't already
      if (this.onAudioChunk) {
        this.connect(this.onAudioChunk, this.onError || undefined, this.onEnd || undefined);
      }
    }
  }

  disconnect() {
    this.autoReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close(1000, "Normal closure");
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

export const ttsSocket = new TTSSocketService();
