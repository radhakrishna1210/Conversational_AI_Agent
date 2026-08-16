// How long is this audio file?
//
// A broadcast is priced and paced on duration, so the number has to come from
// the bytes rather than from whoever uploaded them. There is no ffmpeg in this
// deployment and adding one for a header read is not a trade worth making, so
// this parses the two container formats a carrier will actually play: WAV
// (exact, from the header) and MP3 (from frame headers).
//
// The browser also measures the file when it is selected, and the caller passes
// that in as a cross-check. Where the two disagree the LONGER value wins:
// under-stating duration under-quotes the cost and under-paces the dialer,
// which are the two failures that cost money.

/** Nothing a carrier should be asked to play is longer than this. */
export const MAX_RECORDING_SEC = 300;

const MPEG_BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const MPEG_BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];
const SAMPLE_RATES = {
  // MPEG-1 / MPEG-2 / MPEG-2.5, indexed by the two-bit field in the header.
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/**
 * WAV duration from the RIFF header.
 *
 * Exact for PCM, which is what every "wav" a carrier accepts actually is:
 * dataBytes / byteRate is the definition of the format's timeline.
 *
 * @returns {number|null} seconds, or null when this is not a parseable RIFF
 */
export function wavDurationSec(buf) {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let byteRate = 0;
  let offset = 12;
  // Walk the chunk list rather than assuming `fmt ` sits at byte 12 — a file
  // written with a LIST/INFO chunk first is still perfectly valid audio, and
  // assuming the layout is how a correct file gets reported as 0 seconds.
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ' && body + 16 <= buf.length) {
      byteRate = buf.readUInt32LE(body + 8);
    } else if (id === 'data') {
      if (!byteRate) return null;
      // `size` can lie on a stream that was written without seeking back to fix
      // the header; the real remainder of the file is the safer floor.
      const dataBytes = Math.min(size || Infinity, buf.length - body);
      return dataBytes / byteRate;
    }

    // Chunks are word-aligned: an odd size is followed by one pad byte.
    offset = body + size + (size % 2);
  }
  return null;
}

/**
 * MP3 duration by walking frame headers.
 *
 * Walking every frame rather than assuming constant bitrate, because a VBR file
 * (which is what most TTS providers return) would otherwise be mis-measured by
 * whatever its first frame happened to be. Capped at a generous frame count so a
 * corrupt file cannot turn this into a long scan.
 *
 * @returns {number|null} seconds, or null when no frame header is found
 */
export function mp3DurationSec(buf) {
  let offset = 0;

  // Skip an ID3v2 tag if present: its body is not frame data and stepping into
  // it byte by byte looking for a sync word is both slow and prone to a false
  // positive inside embedded artwork.
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
  }

  let seconds = 0;
  let frames = 0;
  const MAX_FRAMES = 500_000; // ~3.5 hours of 26ms frames; a cap, not a limit anyone reaches

  while (offset + 4 <= buf.length && frames < MAX_FRAMES) {
    // Frame sync: eleven set bits.
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (buf[offset + 1] >> 3) & 0x03;   // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layerBits = (buf[offset + 1] >> 1) & 0x03;     // 1 = Layer III
    const bitrateIndex = (buf[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buf[offset + 2] >> 2) & 0x03;
    const padding = (buf[offset + 2] >> 1) & 0x01;

    const rates = SAMPLE_RATES[versionBits];
    if (versionBits === 1 || layerBits !== 1 || !rates || sampleRateIndex === 3
      || bitrateIndex === 0 || bitrateIndex === 15) {
      offset += 1;
      continue;
    }

    const sampleRate = rates[sampleRateIndex];
    const kbps = (versionBits === 3 ? MPEG_BITRATES_V1_L3 : MPEG_BITRATES_V2_L3)[bitrateIndex];
    if (!sampleRate || !kbps) { offset += 1; continue; }

    // MPEG-1 Layer III carries 1152 samples per frame; MPEG-2/2.5 carry 576.
    const samplesPerFrame = versionBits === 3 ? 1152 : 576;
    const frameBytes = Math.floor((samplesPerFrame / 8) * (kbps * 1000) / sampleRate) + padding;
    if (frameBytes <= 4) { offset += 1; continue; }

    seconds += samplesPerFrame / sampleRate;
    frames += 1;
    offset += frameBytes;
  }

  return frames > 0 ? seconds : null;
}

/**
 * Best available duration for a recording, in whole seconds, rounded UP.
 *
 * Rounded up because everything downstream — the cost estimate, the carrier's
 * own billing increment, the dispatcher's pacing — is a ceiling function of
 * this. A 30.2-second clip that reports 30 quietly under-quotes every call.
 *
 * @param {Buffer} buf
 * @param {string} mimeType
 * @param {number} [clientReportedSec] what the browser measured, if anything
 * @returns {number} seconds; 0 when nothing could be determined
 */
export function measureDurationSec(buf, mimeType = '', clientReportedSec = 0) {
  const mime = String(mimeType).toLowerCase();
  let parsed = null;

  if (mime.includes('wav') || mime.includes('x-pcm')) parsed = wavDurationSec(buf);
  else if (mime.includes('mpeg') || mime.includes('mp3')) parsed = mp3DurationSec(buf);
  else parsed = wavDurationSec(buf) ?? mp3DurationSec(buf);

  const reported = Number(clientReportedSec);
  const candidates = [
    Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    Number.isFinite(reported) && reported > 0 ? reported : 0,
  ];
  return Math.ceil(Math.max(...candidates));
}
