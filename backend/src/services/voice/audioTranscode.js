// backend/src/services/voice/audioTranscode.js
/**
 * Turns a captured recording (WAV from the phone-call mixer, or webm/opus from
 * a browser upload) into the format an agent is configured to store.
 *
 * This is the one deliberate exception to the "no ffmpeg" rule in
 * callRecorder.js: that rule is about the REAL-TIME call path, where a decode
 * would sit in the latency budget of every turn. This runs once, after the
 * call has already ended, off the hot path entirely — the same reasoning that
 * keeps callRecordingTap.js's save() inside setImmediate. ffmpeg-static bundles
 * a static binary, so there is no system-ffmpeg dependency to fail in
 * production the way there would be if this shelled out to a PATH lookup.
 *
 * Fails open to the original buffer/mime/ext on any error — timeout, missing
 * binary, malformed input — for the same reason persistCallRecording() never
 * throws: a lost recording must not become a failed call, and a WAV nobody
 * asked for is a far smaller problem than no recording at all.
 */

import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import logger from '../../lib/logger.js';
import { RECORDING_FORMATS } from '../../constants/recordingFormat.js';

/** Generous but bounded — a stuck ffmpeg process must not hold the event loop open. */
const TRANSCODE_TIMEOUT_MS = 30_000;

const FFMPEG_ARGS = {
  [RECORDING_FORMATS.FLAC]: {
    mime: 'audio/flac',
    ext: '.flac',
    // Lossless regardless of level; level only trades encode time for a little
    // extra size reduction, which barely matters for a few-minutes-long call.
    args: ['-i', 'pipe:0', '-f', 'flac', '-compression_level', '5', 'pipe:1'],
  },
  [RECORDING_FORMATS.OPUS]: {
    mime: 'audio/ogg',
    ext: '.opus',
    // 32kbps mono is comfortably above the "clear enough to listen back to"
    // bar for 8kHz telephony speech, at a fraction of FLAC's size.
    args: ['-i', 'pipe:0', '-f', 'ogg', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', 'pipe:1'],
  },
};

const runFfmpeg = (inputBuffer, args) => new Promise((resolve, reject) => {
  if (!ffmpegPath) return reject(new Error('ffmpeg-static did not resolve a binary path'));

  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args]);
  const stdout = [];
  const stderr = [];
  let settled = false;

  const finish = (fn, arg) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn(arg);
  };

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    finish(reject, new Error(`ffmpeg timed out after ${TRANSCODE_TIMEOUT_MS}ms`));
  }, TRANSCODE_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  child.on('error', (err) => finish(reject, err));
  child.on('close', (code) => {
    if (code === 0) finish(resolve, Buffer.concat(stdout));
    else finish(reject, new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString('utf8').slice(0, 500)}`));
  });

  child.stdin.on('error', () => {
    // A closed stdin (ffmpeg gave up early) throws here; the 'close' handler
    // above still fires and reports the real reason, so this only needs to
    // exist to stop it becoming an unhandled 'error' event.
  });
  child.stdin.end(inputBuffer);
});

/**
 * @param {Buffer} inputBuffer   the captured recording — WAV (phone) or
 *   webm/opus (web call upload); ffmpeg auto-detects the container.
 * @param {string} format        one of RECORDING_FORMATS, or anything else to
 *   pass the input through untouched (e.g. an unrecognised/legacy value).
 * @param {{mime: string, ext: string}} original   what to fall back to on failure.
 * @returns {Promise<{buffer: Buffer, mime: string, ext: string}>}
 */
export async function transcodeRecording(inputBuffer, format, original) {
  const target = FFMPEG_ARGS[format];
  if (!target) return { buffer: inputBuffer, ...original };

  try {
    const buffer = await runFfmpeg(inputBuffer, target.args);
    if (!buffer.length) throw new Error('ffmpeg produced an empty file');
    return { buffer, mime: target.mime, ext: target.ext };
  } catch (err) {
    logger.warn({ format, err: err.message }, 'Recording transcode failed — storing the original format instead');
    return { buffer: inputBuffer, ...original };
  }
}
