// backend/src/services/voice/telephonyAudio.js
/**
 * Audio glue between the modular (STT -> LLM -> TTS) pipeline and a carrier's
 * media stream.
 *
 * The bundled engines never needed this file: they are asked for
 * `audioFormat: 'g711_ulaw'` and their bytes go to the carrier untouched. The
 * modular pipeline has no such luxury — its TTS providers speak their own
 * formats and its STT expects whatever the browser captured — so something has
 * to sit in the middle and make both ends agree on 8kHz G.711 mu-law.
 *
 * Design rules, in priority order:
 *
 *  1. **Never transcode when the provider can emit telephony format directly.**
 *     `telephonyOutputFormat()` exists so ElevenLabs and Cartesia are asked for
 *     ulaw_8000 up front. This module's converters are the fallback for
 *     providers that cannot, not the default path.
 *  2. **Never decode MP3 here.** MP3 would need ffmpeg or a JS decoder in the
 *     hot path of a live call. Providers that can only do MP3 are reported as
 *     telephony-incapable instead, and the agent keeps its honest
 *     greeting-only warning. Silently adding 300ms of decode to every sentence
 *     would be worse than saying no.
 *  3. **Resampling is linear interpolation on purpose.** The destination is an
 *     8kHz phone line whose own codec is far lossier than any interpolation
 *     artefact. A polyphase filter would cost CPU per concurrent call to fix
 *     something G.711 destroys anyway.
 *
 * mu-law encode/decode and the 160-byte frame size are NOT redefined here —
 * they already exist in ambience.js and are re-exported so there is one
 * implementation of G.711 in the codebase.
 */

import { encodeUlaw, decodeUlaw, ULAW_FRAME_BYTES } from './ambience.js';

export { encodeUlaw, decodeUlaw, ULAW_FRAME_BYTES };

/** Carrier media streams are G.711 at 8kHz, always. */
export const PHONE_SAMPLE_RATE = 8000;

/** 160 mu-law bytes = 160 samples at 8kHz = exactly 20ms of audio. */
export const FRAME_MS = (ULAW_FRAME_BYTES / PHONE_SAMPLE_RATE) * 1000;

/**
 * Resample mono PCM16 by linear interpolation.
 *
 * @param {Int16Array} input
 * @param {number} fromRate
 * @param {number} toRate
 * @returns {Int16Array} `input` itself when the rates already match — callers
 *   downstream only read, so returning the same buffer avoids a copy per chunk.
 */
export function resamplePcm16(input, fromRate, toRate) {
  if (!input?.length) return new Int16Array(0);
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx];
    // Hold the last sample rather than reading past the end: reading undefined
    // would produce NaN and, once rounded, a full-scale click at every chunk
    // boundary — audible as a tick between sentences.
    const b = idx + 1 < input.length ? input[idx + 1] : a;
    out[i] = (a + (b - a) * frac) | 0;
  }
  return out;
}

/** Little-endian PCM16 Buffer -> Int16Array, without copying the payload. */
export function bufferToPcm16(buf) {
  if (!buf?.length) return new Int16Array(0);
  // An odd length means a 16-bit sample was split across chunk boundaries;
  // drop the stray byte rather than letting Int16Array throw on a bad stride.
  const usable = buf.length - (buf.length % 2);
  return new Int16Array(buf.buffer, buf.byteOffset, usable / 2);
}

/**
 * Strip a RIFF/WAVE header if present and report the declared sample rate.
 *
 * Providers asked for "pcm"/"linear16" are inconsistent about whether they wrap
 * it: Google returns a full WAV, Sarvam returns WAV, Cartesia returns raw. A
 * header left in place is played as ~44 bytes of loud noise at the start of
 * every sentence, so this is checked rather than assumed.
 *
 * @returns {{ pcm: Int16Array, sampleRate: number|null }} sampleRate is null
 *   when there was no header to read it from — the caller supplies a default.
 */
export function parseWavOrRaw(buf) {
  if (!buf?.length) return { pcm: new Int16Array(0), sampleRate: null };

  const isWav = buf.length > 44
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WAVE';
  if (!isWav) return { pcm: bufferToPcm16(buf), sampleRate: null };

  const sampleRate = buf.readUInt32LE(24);

  // Walk the chunk list instead of assuming data starts at byte 44 — a WAV with
  // a LIST/fact chunk before `data` would otherwise have metadata played as audio.
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const end = Math.min(buf.length, offset + 8 + size);
      return { pcm: bufferToPcm16(buf.subarray(offset + 8, end)), sampleRate };
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }
  return { pcm: bufferToPcm16(buf.subarray(44)), sampleRate };
}

/**
 * Any PCM the TTS produced -> mu-law at 8kHz, ready for the carrier.
 *
 * @param {Buffer} buf        raw PCM16 or a WAV
 * @param {number} fromRate   assumed rate when the payload carries no header
 */
export function pcmToTelephonyUlaw(buf, fromRate) {
  const { pcm, sampleRate } = parseWavOrRaw(buf);
  if (!pcm.length) return Buffer.alloc(0);
  return encodeUlaw(resamplePcm16(pcm, sampleRate || fromRate, PHONE_SAMPLE_RATE));
}

/**
 * Accumulates mu-law bytes and hands back whole 20ms frames.
 *
 * TTS chunks arrive at arbitrary byte lengths; a carrier wants exactly 160
 * bytes per media message. Emitting a short frame makes the far end insert a
 * gap, which is heard as a stutter between sentences, so partial tails are held
 * until the next chunk completes them.
 */
export function createFrameSplitter() {
  let pending = Buffer.alloc(0);

  return {
    /** @returns {Buffer[]} zero or more complete 160-byte frames */
    push(chunk) {
      if (!chunk?.length) return [];
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;

      const frames = [];
      while (pending.length >= ULAW_FRAME_BYTES) {
        frames.push(pending.subarray(0, ULAW_FRAME_BYTES));
        pending = pending.subarray(ULAW_FRAME_BYTES);
      }
      return frames;
    },

    /**
     * Emit whatever is left, padded to a full frame with mu-law silence
     * (0xFF). Call at end of utterance so the final syllable is not clipped.
     */
    flush() {
      if (!pending.length) return null;
      const frame = Buffer.concat([
        pending,
        Buffer.alloc(ULAW_FRAME_BYTES - pending.length, 0xff),
      ]);
      pending = Buffer.alloc(0);
      return frame;
    },

    /** Drop buffered audio — used on barge-in, where the tail is now unwanted. */
    reset() {
      pending = Buffer.alloc(0);
    },

    get pendingBytes() {
      return pending.length;
    },
  };
}

/**
 * Which TTS providers can be driven over a phone line, and how.
 *
 * `native` providers are asked for mu-law/8k directly and cost nothing to
 * bridge. `pcm` providers emit linear PCM that this module resamples and
 * encodes. Anything absent is treated as telephony-incapable, which downgrades
 * the agent to greeting-only with a specific reason.
 *
 * ── Why this list is currently one entry ─────────────────────────────────────
 *
 * A provider belongs here only once its module actually HONOURS
 * `opts.audioFormat`. ElevenLabs does (see elevenlabs.provider.js: both
 * streamVoice and ElevenLabsTtsStream put it in the query string).
 *
 * Cartesia, Google, Sarvam and Fish Audio all hardcode MP3 today and ignore the
 * option. Listing them here would be actively dangerous rather than merely
 * incomplete: the bridge would take MP3 bytes and either ship them to the
 * carrier as if they were G.711, or run them through the PCM resampler — both
 * of which put loud noise on a live call, on the path that dials thousands of
 * people at a time. The capability table has to describe what the code does,
 * not what the provider's API is capable of.
 *
 * To add one: teach its provider module `opts.audioFormat`, verify the bytes
 * really come back in that format, then add the row here.
 *
 *   cartesia  supports  { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 }
 *   google    supports  audioEncoding: 'MULAW' / 'LINEAR16' + sampleRateHertz
 *   fish      supports  format: 'wav' / 'pcm'
 *
 * Keys match `settings.ttsProvider` / the provider registry ids, lowercased.
 */
export const TELEPHONY_TTS = {
  elevenlabs: { kind: 'native', format: 'ulaw_8000' },
  // Verified against the live API, not read off a docs page: the stream
  // endpoint with output_audio_codec 'mulaw' + speech_sample_rate 8000 returns
  // raw headerless G.711 (audio/mulaw, 8000 bytes/second), which is byte-for-byte
  // what a carrier media stream carries. Sarvam's own error message lists the
  // full set: mp3 | linear16 | mulaw | alaw | opus.
  //
  // This row is not a nicety. Every Indian-language voice in this product comes
  // from Sarvam, and without it each of those agents was refused by the phone
  // bridge — they could hold a web call but never take a phone call.
  sarvam: { kind: 'native', format: 'mulaw' },
};

/** @returns {boolean} can this TTS provider feed a carrier at all? */
export function supportsTelephony(provider) {
  return Boolean(TELEPHONY_TTS[String(provider || '').toLowerCase()]);
}

/** @returns {{kind:'native'|'pcm', format:string, rate?:number}|null} */
export function telephonyOutputFormat(provider) {
  return TELEPHONY_TTS[String(provider || '').toLowerCase()] || null;
}

/**
 * Can an audio segment go on the wire as-is?
 *
 * `segmentFormat` is the format the runtime ASKED TTS for when it produced the
 * segment (voiceTurnStream's `format` field on audio-start) — not a sniffed
 * magic number and not a provider's Content-Type header, either of which can
 * disagree with the bytes.
 *
 * On a `native` bridge the answer must be exact: those bytes are forwarded to
 * the carrier untouched, so anything else is played AS G.711 rather than
 * converted to it. That is not a quality issue, it is static on a live call —
 * the pre-synthesized ack clip was cached without a format for exactly as long
 * as nobody checked, and every phone reply opened with a burst of noise. A
 * `pcm` bridge resamples, so it is not this function's business.
 *
 * @param {string|null|undefined} segmentFormat
 * @param {{kind:string, format:string}|null} ttsFormat
 */
export function playableWithFormat(segmentFormat, ttsFormat) {
  if (ttsFormat?.kind !== 'native') return true;
  return (segmentFormat ?? null) === ttsFormat.format;
}
