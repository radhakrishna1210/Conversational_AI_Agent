/**
 * AudioStreamPlayer Service
 * Manages low-latency playback of audio chunks using Web Audio API.
 * Uses a time-scheduled queue for gapless continuous playback.
 *
 * Scheduling model
 * ────────────────
 *  nextStartTime === 0   → no active stream; anchor to currentTime + lookahead
 *  nextStartTime < now   → drift detected; re-anchor with warning
 *  otherwise             → schedule chunk immediately after the previous one ends
 */

// Minimum forward margin (seconds) between AudioContext.currentTime and the
// next scheduled start. Absorbs decode jitter without producing audible gaps.
const SCHEDULE_AHEAD_SEC = 0.05;

class AudioStreamPlayer {
  private audioContext: AudioContext | null = null;

  /**
   * Wall-clock position (in AudioContext time) where the next chunk should start.
   * 0 means "no stream is active" — the first call to playChunk will anchor it.
   */
  private nextStartTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  /**
   * Monotonically increasing counter. Each new request bumps this; playChunk
   * checks its captured value at decode-time and silently drops the chunk if
   * the stream was cancelled while decoding was in flight.
   */
  private currentStreamId: number = 0;

  constructor() {}

  private initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive',
      });
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Decodes a raw ArrayBuffer and schedules it for gapless playback.
   * Each chunk is placed exactly at nextStartTime; nextStartTime advances
   * by the chunk's duration so the following chunk slots in seamlessly.
   */
  async playChunk(buffer: ArrayBuffer): Promise<void> {
    this.initContext();
    if (!this.audioContext) return;

    // Capture stream ID before the async decode; if cancelStream() is called
    // while decoding, the captured ID will no longer match and we drop the chunk.
    const myStreamId = this.currentStreamId;

    const chunkSize = buffer.byteLength;
    console.log(`[Audio] Decoding chunk → ${chunkSize} bytes (stream #${myStreamId})`);
    const decodeStart = performance.now();

    try {
      // Pass the ArrayBuffer directly — no intermediate Blob conversion
      const audioBuffer = await this.audioContext.decodeAudioData(buffer);
      const decodeMs = (performance.now() - decodeStart).toFixed(1);

      // ── Stale-chunk guard ─────────────────────────────────────────────────
      if (myStreamId !== this.currentStreamId) {
        console.log(
          `[Audio] Chunk dropped → stream #${myStreamId} was cancelled (current: #${this.currentStreamId})`
        );
        return;
      }

      console.log(
        `[Audio] Decode complete → ${decodeMs}ms, duration: ${audioBuffer.duration.toFixed(3)}s`
      );

      const currentTime = this.audioContext.currentTime;

      if (this.nextStartTime === 0) {
        // ── First chunk: anchor the timeline ────────────────────────────────
        // Use a very small lookahead (10ms) for the first chunk to start playback ASAP.
        this.nextStartTime = currentTime + 0.01;
        console.log(
          `[Audio] Stream start → first chunk anchored at t=${this.nextStartTime.toFixed(3)}s`
        );
      } else if (this.nextStartTime < currentTime) {
        // ── Drift correction ────────────────────────────────────────────────
        const driftSec = (currentTime - this.nextStartTime).toFixed(3);
        console.warn(
          `[Audio] Drift detected → ${driftSec}s behind real time; re-anchoring`
        );
        this.nextStartTime = currentTime + SCHEDULE_AHEAD_SEC;
      }

      // ── Build and connect the source node ───────────────────────────────
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Keep a reference so we can forcibly stop it on interrupt()
      this.activeSources.push(source);
      source.onended = () => {
        this.activeSources = this.activeSources.filter(s => s !== source);
      };

      // ── Schedule gaplessly ──────────────────────────────────────────────
      console.log(
        `[Audio] Playback scheduled at t=${this.nextStartTime.toFixed(3)}s` +
        ` (ctx now: ${currentTime.toFixed(3)}s)`
      );
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      console.log(`[Audio] Next slot → t=${this.nextStartTime.toFixed(3)}s`);

    } catch (e) {
      console.error(`[Audio] Decode/Schedule failed for ${chunkSize}-byte chunk:`, e);
    }
  }

  /**
   * Cancels the current stream and prepares for a new one.
   * Call this before sending a new TTS request to ensure the new audio
   * starts immediately with no overlap from the previous stream.
   *
   * Steps:
   *  1. Bump streamId → any chunks still decoding in-flight will be dropped
   *  2. Stop all active AudioBufferSourceNodes immediately
   *  3. Clear the active sources list
   *  4. Reset nextStartTime so the next chunk re-anchors the timeline
   */
  cancelStream(): void {
    const prev = this.currentStreamId;
    this.currentStreamId += 1;
    console.log(
      `[Audio] Stream cancelled → #${prev} stopped, new stream will be #${this.currentStreamId}`
    );
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (_) { /* already stopped or not yet started */ }
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    console.log('[Audio] Queue cleared, timing reset → ready for new stream');
  }

  /**
   * Immediately stops all playing and scheduled audio, then resets state.
   */
  interrupt(): void {
    console.log(
      `[Audio] Interrupting playback → stopping ${this.activeSources.length} active source(s)`
    );
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (_) { /* already stopped or not yet started */ }
    });
    this.activeSources = [];
    this.reset();
  }

  /**
   * Resets the playback timeline.
   * Setting nextStartTime to 0 signals "no active stream"; the next playChunk
   * call will re-anchor to AudioContext.currentTime automatically.
   */
  reset(): void {
    this.nextStartTime = 0;
    console.log('[Audio] Playback state reset → scheduler re-anchors on next chunk');
  }

  /**
   * Stops playback and suspends the audio context to release resources.
   */
  stop(): void {
    console.log('[Audio] Stop requested → suspending audio context');
    this.interrupt();
    if (this.audioContext) {
      this.audioContext.suspend();
    }
  }
}

export const audioPlayer = new AudioStreamPlayer();
