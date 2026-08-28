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

/**
 * `<callLogId>--<timestamp>-<random><ext>`.
 *
 * The call id is IN THE NAME deliberately. A recording always reaches disk
 * BEFORE the row that points at it is updated — here, and in multer's upload
 * path — so anything that interrupts that gap (a failed write, a dropped
 * connection, the process dying at the end of a call) stranded the audio: the
 * file sat on disk, no row referenced it, and nothing could work out which
 * call it belonged to. The retention sweep's orphan pass then deleted it a
 * week later. Carrying the id makes that gap recoverable rather than fatal;
 * reattachOrphanRecordings() in recordingRetention.service.js reads it back.
 *
 * Both writers share this helper so the directory stays uniform.
 */
export const recordingFilename = (callLogId, ext) =>
  `${callLogId}--${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

/**
 * Inverse of recordingFilename(). Null for any name it did not produce, which
 * includes every file written before the id was added to the format — those
 * used a single `-` separator and are genuinely unattributable.
 */
export const callIdFromRecordingFilename = (name) => {
  const marker = String(name).indexOf('--');
  if (marker <= 0) return null;
  const id = name.slice(0, marker);
  // cuid shape. Narrow enough that a legacy `<13-digit-timestamp>-<rand>` name
  // cannot be mistaken for an id even if one ever contained a double dash.
  return /^[a-z0-9]{16,40}$/i.test(id) ? id : null;
};

/**
 * Write a server-produced recording and attach it to its call log.
 *
 * The file is written BEFORE the row is updated. The reverse order can leave a
 * row advertising audio that does not exist, which the UI shows as a player
 * that 404s; this order can at worst leave an unreferenced file, which
 * reattachOrphanRecordings() links back up on the next sweep.
 *
 * Never throws. This runs during socket teardown, where the alternative to a
 * logged failure is an unhandled rejection on a path that also has to settle
 * the call's billing.
 *
 * @returns {Promise<{saved: boolean, filename?: string, bytes?: number}>}
 */
export async function persistCallRecording(callLogId, buffer, { mime = 'audio/wav', ext = '.wav' } = {}) {
  if (!callLogId || !buffer?.length) return { saved: false };

  const filename = recordingFilename(callLogId, ext);
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
    // The bytes STAY on disk. Deleting them here was right only while the file
    // name said nothing about its call: the audio was unreachable, so it was
    // just waste. Now the name carries the call id, so an unreachable file is
    // a recoverable one — reattachOrphanRecordings() links it up on the next
    // sweep, and this failure costs a delay rather than the recording. The
    // retention orphan pass still reclaims it if the row is genuinely gone.
    logger.warn(
      { callLogId, filename, err: err.message },
      'Could not attach call recording to its call log — leaving it on disk for the reattach sweep',
    );
    return { saved: false };
  }

  return { saved: true, filename, bytes: buffer.length };
}
