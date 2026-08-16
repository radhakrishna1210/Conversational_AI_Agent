// The audio a broadcast plays.
//
// A recording is created once and dialled thousands of times, which is the whole
// economic point of the feature: no speech-to-text, no LLM, no per-call
// text-to-speech, so a broadcast call costs the carrier minute and nothing else.
// That only holds if the audio is rendered ONCE, here, and served as a static
// file afterwards — never synthesised per call.
//
// Two ways in:
//   UPLOAD  an MP3 or WAV the customer already has (a studio ad, an IVR prompt).
//   TTS     text, synthesised through the same voices the agents use, stored as
//           a file from then on.
//
// One way out: a public, HMAC-signed URL the carrier fetches at answer time.
// Public because a carrier cannot hold a login, signed because the alternative
// is an enumerable URL that leaks every customer's marketing audio.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { publicHttpBase } from '../../lib/publicUrl.js';
import { getVoice, synthesizeVoiceToBuffer } from '../voice.service.js';
import { measureDurationSec, MAX_RECORDING_SEC } from './audioDuration.js';
import { signToken, verifyToken } from './signedToken.js';

export const RECORDINGS_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'broadcast-recordings');

export const RECORDING_SOURCE = Object.freeze({ UPLOAD: 'UPLOAD', TTS: 'TTS' });

/**
 * What a carrier will actually play.
 *
 * Twilio's <Play> and Plivo's <Play> both accept MP3 and PCM WAV and neither
 * accepts Ogg/Opus — which is what Fish Audio returns when FISH_TTS_FORMAT=opus.
 * Refusing here, at creation, is the difference between one clear error message
 * and a broadcast that dials ten thousand people and plays silence to all of
 * them.
 */
const PLAYABLE_MIME = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/wave', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/vnd.wave', '.wav'],
]);

const normalizeMime = (mime) => {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (m === 'audio/mp3') return 'audio/mpeg';
  if (m === 'audio/wave' || m === 'audio/x-wav' || m === 'audio/vnd.wave') return 'audio/wav';
  return m;
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Same shape the other upload paths produce, so the directory stays uniform. */
const newFilename = (ext) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

// ── Public URL signing ───────────────────────────────────────────────────────

/**
 * A token for one recording.
 *
 * Deliberately NOT time-limited. A broadcast can be scheduled for next week and
 * a carrier fetches the file at the moment each call is answered, so an expiring
 * token would silently break the calls furthest from launch — the failure that
 * is hardest to notice. The token is a capability on one immutable file; the
 * file is deleted when the recording is, which is what revokes it.
 */
export const audioToken = (recordingId) => signToken('audio', recordingId);

export const verifyAudioToken = (recordingId, token) => verifyToken('audio', recordingId, token);

/**
 * The URL a carrier is given.
 *
 * @throws when this server has no public address — a broadcast that dials with
 *   an unreachable audio URL connects the call and plays nothing, so this fails
 *   loudly at launch instead.
 */
export function publicAudioUrl(recordingId) {
  const base = publicHttpBase();
  if (!base) {
    throw Object.assign(
      new Error(
        'This server has no public address (PUBLIC_BACKEND_WS_URL / PUBLIC_BACKEND_URL are unset), '
        + 'so the carrier has nowhere to fetch the broadcast audio from. Set one before broadcasting.',
      ),
      { statusCode: 503 },
    );
  }
  return `${base}/api/v1/broadcast-audio/${recordingId}?token=${audioToken(recordingId)}`;
}

// ── Creation ────────────────────────────────────────────────────────────────

/**
 * Write bytes to disk and record them. Shared by both creation paths.
 *
 * The file lands BEFORE the row, for the same reason call recordings do: a row
 * pointing at a file that does not exist is a broadcast that plays silence,
 * while a file with no row is garbage the delete path already tolerates.
 */
async function storeRecording({
  workspaceId, name, source, buffer, mimeType, scriptText = null, voiceId = null,
  createdById = null, clientDurationSec = 0,
}) {
  const mime = normalizeMime(mimeType);
  const ext = PLAYABLE_MIME.get(mime);
  if (!ext) {
    throw badRequest(
      `A phone line can only play MP3 or WAV audio, and this is ${mime || 'an unknown format'}. `
      + 'Convert it to MP3 and upload again.',
    );
  }

  const durationSec = measureDurationSec(buffer, mime, clientDurationSec);
  if (!durationSec) {
    throw badRequest(
      'That file has no readable audio — its duration could not be determined. Re-export it as a '
      + 'standard MP3 or PCM WAV.',
    );
  }
  if (durationSec > MAX_RECORDING_SEC) {
    throw badRequest(
      `That recording is ${durationSec}s long. Broadcast messages are capped at ${MAX_RECORDING_SEC}s `
      + '— people hang up well before that, and every second is billed on every call that answers.',
    );
  }

  const filename = newFilename(ext);
  await fs.mkdir(RECORDINGS_DIR, { recursive: true });
  await fs.writeFile(path.join(RECORDINGS_DIR, filename), buffer);

  try {
    return await prisma.broadcastRecording.create({
      data: {
        workspaceId,
        name: String(name).trim().slice(0, 120),
        source,
        storedPath: filename,
        mimeType: mime,
        sizeBytes: buffer.length,
        durationSec,
        scriptText,
        voiceId,
        createdById,
        status: 'READY',
      },
    });
  } catch (err) {
    await fs.unlink(path.join(RECORDINGS_DIR, filename)).catch(() => {});
    throw err;
  }
}

/**
 * Store an uploaded MP3/WAV.
 *
 * @param {string} workspaceId
 * @param {{path: string, mimetype: string, originalname: string}} file  multer file
 * @param {{name?: string, durationSec?: number, createdById?: string}} opts
 */
export async function createFromUpload(workspaceId, file, opts = {}) {
  if (!file) throw badRequest('No audio file was uploaded');

  const buffer = await fs.readFile(file.path);
  try {
    return await storeRecording({
      workspaceId,
      name: opts.name || file.originalname?.replace(/\.[^.]+$/, '') || 'Recording',
      source: RECORDING_SOURCE.UPLOAD,
      buffer,
      // Browsers send a mimetype; some send none for .wav. Fall back to the
      // extension rather than refusing a perfectly playable file.
      mimeType: normalizeMime(file.mimetype) || (file.originalname?.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
      clientDurationSec: Number(opts.durationSec) || 0,
      createdById: opts.createdById ?? null,
    });
  } finally {
    // multer's temp file has been copied into place (or rejected) either way.
    await fs.unlink(file.path).catch(() => {});
  }
}

/**
 * Synthesise a script once and keep the audio.
 *
 * This is the ONLY text-to-speech a broadcast ever pays for: one render, however
 * many thousands of calls. At ~₹0.15 per 100 characters that is a rounding error
 * against the carrier minutes, which is why the cost model treats a broadcast as
 * telephony-only.
 */
export async function createFromText(workspaceId, { name, text, voiceId, createdById = null }) {
  const script = String(text || '').trim();
  if (!script) throw badRequest('Write the message you want spoken');
  if (script.length > 3000) {
    throw badRequest('That script is longer than 3,000 characters — well past the point where people hang up.');
  }
  if (!voiceId) throw badRequest('Pick a voice to record this message in');

  const voice = await getVoice(voiceId);
  if (!voice) throw Object.assign(new Error('That voice no longer exists'), { statusCode: 404 });

  const { buffer, contentType } = await synthesizeVoiceToBuffer(voice, script);
  if (!PLAYABLE_MIME.has(normalizeMime(contentType))) {
    throw Object.assign(
      new Error(
        `${voice.provider?.name ?? 'That provider'} returned ${contentType}, which a phone line cannot `
        + 'play. Pick a voice from a provider that returns MP3 or WAV, or upload the audio instead.',
      ),
      { statusCode: 409 },
    );
  }

  return storeRecording({
    workspaceId,
    name: name || script.slice(0, 60),
    source: RECORDING_SOURCE.TTS,
    buffer,
    mimeType: contentType,
    scriptText: script,
    voiceId,
    createdById,
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────

export const listRecordings = (workspaceId) =>
  prisma.broadcastRecording.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

export const getRecording = (workspaceId, recordingId) =>
  prisma.broadcastRecording.findFirst({ where: { id: recordingId, workspaceId } });

/** Absolute path of the bytes. Used by both the authenticated preview and the carrier-facing endpoint. */
export const recordingFilePath = (recording) => path.join(RECORDINGS_DIR, recording.storedPath);

/**
 * Read a recording by id alone, for the public audio endpoint.
 *
 * No workspace scoping here on purpose: the carrier has no session, and the
 * signed token in the URL is what authorises the read. The controller verifies
 * it BEFORE calling this.
 */
export const getRecordingUnscoped = (recordingId) =>
  prisma.broadcastRecording.findUnique({ where: { id: recordingId } });

// ── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete a recording and its bytes.
 *
 * Refused while any broadcast still points at it. A sent broadcast has to be
 * able to answer "what did we play to these people" — which is a compliance
 * question in India, not a nicety — and the schema enforces the same thing with
 * ON DELETE RESTRICT. This check exists to turn that constraint into a sentence.
 */
export async function deleteRecording(workspaceId, recordingId) {
  const recording = await prisma.broadcastRecording.findFirst({
    where: { id: recordingId, workspaceId },
  });
  if (!recording) throw Object.assign(new Error('Recording not found'), { statusCode: 404 });

  const used = await prisma.broadcast.count({ where: { recordingId } });
  if (used > 0) {
    throw Object.assign(
      new Error(
        `${used} broadcast${used === 1 ? '' : 's'} still reference this recording, and a sent broadcast `
        + 'has to keep a record of what it played. Delete those broadcasts first.',
      ),
      { statusCode: 409 },
    );
  }

  await prisma.broadcastRecording.delete({ where: { id: recordingId } });
  await fs.unlink(recordingFilePath(recording)).catch((e) =>
    logger.warn(`Broadcast recording ${recordingId} row deleted but its file was not: ${e.message}`));
  return { deleted: true };
}
