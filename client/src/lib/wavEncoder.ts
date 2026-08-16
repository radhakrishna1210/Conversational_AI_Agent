/**
 * Turn whatever MediaRecorder produced into audio a phone line can play.
 *
 * This exists because of a mismatch that is invisible until a broadcast goes
 * out: MediaRecorder gives you WebM/Opus (Chrome) or MP4/AAC (Safari), and
 * neither Twilio's <Play> nor Plivo's accepts either. Uploading the raw
 * recording produces a broadcast that dials every number and plays silence.
 *
 * So the browser decodes it and re-encodes to the format the PSTN actually
 * carries: 8 kHz, mono, 16-bit PCM WAV. Downsampling is not a compromise here —
 * a phone call IS 8 kHz mono, so anything richer is bytes the carrier discards
 * on the way in, and the file is ~20x smaller for the same audio.
 */

/** What the phone network carries. Anything else is resampled away by the carrier. */
const TELEPHONY_RATE = 8000;

type AudioContextCtor = typeof AudioContext;

const getAudioContext = (): AudioContextCtor => {
  const ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!ctor) throw new Error('This browser cannot process audio (no Web Audio support).');
  return ctor;
};

/** 16-bit PCM WAV around already-rendered mono samples. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);        // PCM chunk size
  view.setUint16(20, 1, true);         // format: PCM
  view.setUint16(22, 1, true);         // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);         // block align
  view.setUint16(34, 16, true);        // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    // Clamp before scaling: a sample above 1.0 (which compressors and gain
    // staging do produce) wraps to full-scale negative otherwise, and that is
    // audible as a click on every peak.
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Decode, downmix, resample, re-encode.
 *
 * @param blob whatever MediaRecorder produced
 * @returns a telephony-ready WAV and its exact duration
 */
export async function toTelephonyWav(blob: Blob): Promise<{ blob: Blob; durationSec: number }> {
  const Ctx = getAudioContext();
  const ctx = new Ctx();

  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.duration) throw new Error('That recording is empty.');

    // OfflineAudioContext does the resample and the downmix in one pass, and
    // does it in the browser's own (optimised, correctly filtered) resampler —
    // a hand-rolled decimation would alias speech into a metallic mess.
    const frames = Math.max(1, Math.ceil(decoded.duration * TELEPHONY_RATE));
    const offline = new OfflineAudioContext(1, frames, TELEPHONY_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    return {
      blob: encodeWav(rendered.getChannelData(0), TELEPHONY_RATE),
      durationSec: rendered.duration,
    };
  } finally {
    // Every AudioContext holds a hardware audio thread. Leaving them open across
    // a few takes exhausts the browser's limit and the next one silently fails
    // to start.
    await ctx.close().catch(() => {});
  }
}

/** Duration of a file the user picked, without re-encoding it. */
export async function probeDuration(file: File): Promise<number> {
  const Ctx = getAudioContext();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    return decoded.duration;
  } catch {
    // A format the browser cannot decode is not necessarily one the carrier
    // cannot play, so this is a best-effort cross-check: the server parses the
    // header itself and refuses anything genuinely unplayable.
    return 0;
  } finally {
    await ctx.close().catch(() => {});
  }
}
