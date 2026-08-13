// backend/src/services/callRecordingStore.js
/**
 * Where a call recording lives on disk, and the one way to put one there from
 * the server side.
 *
 * Web calls reach storage through multer (agentCallLog.controller.js): the
 * browser uploads a finished blob and the handler moves it into place. A phone
 * call has no upload — the bridge holds the mixed audio in memory and hands it
 * over directly — so that path is unusable and this exists instead.
 *
 * Both paths deliberately converge on the SAME directory and the SAME two
 * columns, so everything downstream (the playback endpoints, the admin filter,
 * the retention sweep, agent deletion) keeps working without knowing which kind
 * of call produced the file.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';

export const RECORDINGS_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'call-recordings');

/** Same shape multer's filename callback produces, so the directory stays uniform. */
const newFilename = (ext) =>
  `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

/**
 * Write a server-produced recording and attach it to its call log.
 *
 * The file is written BEFORE the row is updated. The reverse order can leave a
 * row advertising audio that does not exist, which the UI shows as a player
 * that 404s; this order can at worst leave an unreferenced file, which the
 * retention sweep's orphan pass reclaims.
 *
 * Never throws. This runs during socket teardown, where the alternative to a
 * logged failure is an unhandled rejection on a path that also has to settle
 * the call's billing.
 *
 * @returns {Promise<{saved: boolean, filename?: string, bytes?: number}>}
 */
export async function persistCallRecording(callLogId, buffer, { mime = 'audio/wav', ext = '.wav' } = {}) {
  if (!callLogId || !buffer?.length) return { saved: false };

  const filename = newFilename(ext);
  const filePath = path.join(RECORDINGS_DIR, filename);

  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    await fs.writeFile(filePath, buffer);
  } catch (err) {
    logger.warn({ callLogId, err: err.message }, 'Could not write call recording to disk');
    return { saved: false };
  }

  try {
    await prisma.agentCallLog.update({
      where: { id: callLogId },
      data: { recordingPath: filename, recordingMime: mime },
    });
  } catch (err) {
    // The row is gone or unreachable — do not leave the bytes behind, since
    // nothing would ever point at them again.
    await fs.unlink(filePath).catch(() => {});
    logger.warn({ callLogId, err: err.message }, 'Could not attach call recording to its call log');
    return { saved: false };
  }

  return { saved: true, filename, bytes: buffer.length };
}
