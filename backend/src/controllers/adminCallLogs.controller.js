// backend/src/controllers/adminCallLogs.controller.js
/**
 * Cross-tenant call log HTTP surface for the admin console.
 *
 * Read-only. Nothing here mutates a call, a transcript or a billing record —
 * an operator inspecting calls should not be able to alter the record of what
 * happened, and the money fields in particular are written only by
 * settleCall().
 */

import fs from 'fs';
import path from 'path';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import * as calls from '../services/adminCallLogs.service.js';

// Same location agentCallLog.controller.js writes to.
const RECORDINGS_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'call-recordings');

/** GET /admin/call-logs */
export const listCallLogs = async (req, res) => {
  try {
    res.json(await calls.listCallLogs(req.query));
  } catch (err) {
    logger.error({ err: err.message }, 'admin listCallLogs failed');
    res.status(500).json({ error: 'Failed to load call logs' });
  }
};

/** GET /admin/call-logs/stats */
export const getCallStats = async (req, res) => {
  try {
    res.json(await calls.getCallStats({ days: req.query.days }));
  } catch (err) {
    logger.error({ err: err.message }, 'admin getCallStats failed');
    res.status(500).json({ error: 'Failed to load call statistics' });
  }
};

/** GET /admin/call-logs/options */
export const getCallFilterOptions = async (_req, res) => {
  try {
    res.json(await calls.getCallFilterOptions());
  } catch (err) {
    logger.error({ err: err.message }, 'admin getCallFilterOptions failed');
    res.status(500).json({ error: 'Failed to load filter options' });
  }
};

/** GET /admin/call-logs/:id */
export const getCallLog = async (req, res) => {
  try {
    const row = await calls.getCallLog(req.params.id);
    if (!row) return res.status(404).json({ error: 'Call not found' });
    res.json(row);
  } catch (err) {
    logger.error({ err: err.message }, 'admin getCallLog failed');
    res.status(500).json({ error: 'Failed to load call' });
  }
};

/**
 * GET /admin/call-logs/:id/recording
 *
 * `path.basename` is applied to the stored value before joining, so a stored
 * path can never traverse out of the recordings directory even if the column
 * were somehow written with one.
 */
export const getCallRecording = async (req, res) => {
  try {
    const row = await calls.getRecordingRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Call not found' });
    if (!row.recordingPath) return res.status(404).json({ error: 'This call has no recording' });

    const filePath = path.join(RECORDINGS_DIR, path.basename(row.recordingPath));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Recording file is missing from storage' });
    }

    // Range support so the player can seek rather than re-download the file.
    const stat = fs.statSync(filePath);
    const mime = row.recordingMime || 'audio/webm';
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10) || 0;
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      if (start >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
        return res.end();
      }
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mime,
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    res.set({ 'Content-Type': mime, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error({ err: err.message }, 'admin getCallRecording failed');
    if (!res.headersSent) res.status(500).json({ error: 'Failed to stream recording' });
  }
};
