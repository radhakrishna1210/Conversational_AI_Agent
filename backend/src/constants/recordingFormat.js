// The two formats a Superadmin may choose, per agent, for stored call
// recordings. See prisma/schema.prisma (Agent.recordingFormat) and
// services/voice/audioTranscode.js for how a WAV/webm capture actually becomes
// one of these on disk.
export const RECORDING_FORMATS = Object.freeze({
  // Lossless. Safe default: recordings feed STT/voice-cloning/sentiment
  // training, and a lossy encode is a one-way door on fidelity a future
  // training run might need.
  FLAC: 'FLAC',
  // Lossy (Opus). Meaningfully smaller; chosen per-agent where storage/
  // bandwidth matters more than training fidelity.
  OPUS: 'OPUS',
});

export const DEFAULT_RECORDING_FORMAT = RECORDING_FORMATS.FLAC;

export const isRecordingFormat = (value) =>
  Object.values(RECORDING_FORMATS).includes(String(value ?? '').toUpperCase());
