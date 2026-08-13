// backend/src/services/voice/callRecorder.js
/**
 * Server-side recording of a phone call, mixed to one mono WAV.
 *
 * A web call is recorded by the browser: it owns both the mic stream and the
 * agent's playback, mixes them into one MediaStream and uploads the blob at
 * hangup (EditAgent.tsx). A phone call has no browser, so nothing was recording
 * phone or campaign calls at all — they landed in Recent Calls with a
 * transcript and no audio.
 *
 * ── The hard part is not capture, it is TIME ─────────────────────────────────
 *
 * Both legs are already 8kHz G.711 mu-law, so no transcoding is involved. But
 * the two directions do NOT arrive on the same clock:
 *
 *   inbound   the carrier streams the caller at realtime, ~50 frames/second,
 *             for the whole call. Arrival time IS call time.
 *   outbound  nothing paces the agent leg. TTS bytes are pushed to the carrier
 *             as fast as they are produced and the carrier's jitter buffer
 *             drains them at realtime — a 15s reply ships in ~3s
 *             (playoutWindow.js). Send time is NOT call time.
 *
 * Concatenating each direction and overlaying them would therefore compress the
 * agent's speech into the front of every turn: the recording would have the
 * agent talking over a caller who, in reality, had already stopped. So writes
 * carry an explicit `atMs` offset from the start of the call and land at that
 * position; the bridge derives the outbound one from the playout clock, which
 * already knows when the carrier will actually play a frame.
 *
 * Gaps between writes stay silent, overlaps sum. That makes the output a real
 * timeline rather than a splice, which is what makes it usable as evidence of
 * what was said when.
 *
 * ── Format ───────────────────────────────────────────────────────────────────
 *
 * PCM16 WAV, 8kHz mono. Chosen for playing everywhere with no dependency: the
 * existing player is a plain <audio> element, and this codebase deliberately
 * has no ffmpeg and no MP3/Opus encoder (telephonyAudio.js rule 2). Mixing has
 * to happen in the linear domain anyway.
 *
 * It costs ~960KB/minute, which is only reasonable because recordings are
 * deleted on a timer (recordingRetention.service.js). Storing the mix back as
 * mu-law would halve that at no quality cost — the source is mu-law — but
 * mu-law WAV playback is not uniformly supported across browsers, and a
 * recording that will not play is worse than one that is large.
 */

import { decodeUlaw, PHONE_SAMPLE_RATE } from './telephonyAudio.js';

/**
 * Hard ceiling on a single recording, as a memory guard rather than a policy.
 * Audio is held in RAM until hangup, so without a cap one stuck call — a
 * carrier that never closes the socket — grows until the process dies, taking
 * every other live call on the box with it. An hour of 8kHz mu-law is ~29MB
 * held, ~57MB at render.
 */
const DEFAULT_MAX_MS = 60 * 60 * 1000;

const clampSample = (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);

/**
 * @param {object} [opts]
 * @param {number} [opts.maxMs]       refuse writes past this point in the call
 * @param {number} [opts.sampleRate]
 */
export function createCallRecorder({ maxMs = DEFAULT_MAX_MS, sampleRate = PHONE_SAMPLE_RATE } = {}) {
  const maxSamples = Math.ceil((maxMs / 1000) * sampleRate);
  const msToSamples = (ms) => Math.max(0, Math.round((ms / 1000) * sampleRate));

  /** @type {{at:number, ulaw:Buffer}[]} */
  let inbound = [];
  /** @type {{at:number, ulaw:Buffer}[]} */
  let outbound = [];
  let bytesHeld = 0;
  let capped = false;

  const write = (track, ulaw, atMs) => {
    if (!ulaw?.length || capped) return;
    const at = msToSamples(atMs);
    if (at + ulaw.length > maxSamples) {
      capped = true;
      return;
    }
    // Copy: callers hand us frames that are subarray views onto a shared
    // splitter buffer (createFrameSplitter), which is reused and overwritten
    // long before finish() reads any of this.
    track.push({ at, ulaw: Buffer.from(ulaw) });
    bytesHeld += ulaw.length;
  };

  return {
    /** Caller audio. `atMs` is arrival time, which on the inbound leg is call time. */
    writeInbound(ulaw, atMs) { write(inbound, ulaw, atMs); },

    /** Agent audio. `atMs` must be PLAYOUT time, not send time — see the header. */
    writeOutbound(ulaw, atMs) { write(outbound, ulaw, atMs); },

    /**
     * The caller interrupted: the carrier was told to discard everything it had
     * buffered, so audio scheduled after this point was never heard and must
     * not appear in the recording. Without this the recording contradicts the
     * transcript — the agent is heard finishing a sentence it was cut off in.
     */
    dropOutboundAfter(atMs) {
      const cut = msToSamples(atMs);
      outbound = outbound.reduce((keep, w) => {
        if (w.at >= cut) return keep;
        // A frame straddling the cut is kept only up to it.
        if (w.at + w.ulaw.length > cut) keep.push({ at: w.at, ulaw: w.ulaw.subarray(0, cut - w.at) });
        else keep.push(w);
        return keep;
      }, []);
    },

    /** True once anything has been captured — a silent call writes no file. */
    get hasAudio() { return inbound.length > 0 || outbound.length > 0; },

    /** Whether the length cap was hit, so the caller can say so in the log. */
    get wasCapped() { return capped; },

    get bytesHeld() { return bytesHeld; },

    /** Free everything without rendering — used when the call ends unrecorded. */
    discard() { inbound = []; outbound = []; bytesHeld = 0; },

    /**
     * Mix both directions to one mono PCM16 WAV.
     * Returns null when nothing was captured.
     */
    toWav() {
      const writes = [...inbound, ...outbound];
      if (writes.length === 0) return null;

      const total = Math.min(
        maxSamples,
        writes.reduce((end, w) => Math.max(end, w.at + w.ulaw.length), 0),
      );
      if (total <= 0) return null;

      const mix = new Int16Array(total);
      for (const w of writes) {
        const pcm = decodeUlaw(w.ulaw);
        const n = Math.min(pcm.length, total - w.at);
        for (let i = 0; i < n; i++) {
          const at = w.at + i;
          // Summed, not replaced: both parties talking at once is a real thing
          // that a call recording is expected to capture.
          mix[at] = clampSample(mix[at] + pcm[i]);
        }
      }

      return encodeWav(mix, sampleRate);
    },
  };
}

/** Mono PCM16 -> a complete RIFF/WAVE file. */
export function encodeWav(pcm, sampleRate = PHONE_SAMPLE_RATE) {
  const bytesPerSample = 2;
  const dataBytes = pcm.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4); // size of everything after this field
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);            // PCM fmt chunk length
  buf.writeUInt16LE(1, 20);             // format 1 = uncompressed PCM
  buf.writeUInt16LE(1, 22);             // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(bytesPerSample, 32);              // block align
  buf.writeUInt16LE(16, 34);            // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * bytesPerSample);
  return buf;
}
