import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import * as reportIssueService from '../services/reportIssue.service.js';

// ─── Screenshot storage ───────────────────────────────────────────────────────
//
// Screenshots of a broken screen routinely contain customer data — phone
// numbers, transcripts, the reporter's own dashboard. They are therefore stored
// OUTSIDE any statically-served directory and handed out only through
// GET /report-issue/:id/screenshot, which is admin-authenticated. The submit
// endpoint stays public (a user hitting a bug may not be able to log in), but
// reading anything back does not.

const SCREENSHOT_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'issue-screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Cap independent of MAX_FILE_SIZE_MB: this endpoint is unauthenticated. */
const MAX_SCREENSHOT_MB = 8;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SCREENSHOT_DIR),
  // Never reuse the client's filename — it is attacker-controlled and would let
  // a submission traverse out of the directory or overwrite another report's file.
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) =>
    ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Screenshot must be a PNG, JPEG, GIF or WebP image'), { statusCode: 400 })),
  limits: { fileSize: MAX_SCREENSHOT_MB * 1024 * 1024, files: 1 },
}).single('screenshot');

/**
 * Multer as middleware, with its errors turned into the JSON shape this
 * controller already returns. Left as-is, a rejected file surfaces as a 500
 * with an HTML body and the form shows "Something went wrong".
 */
export const uploadScreenshot = (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig || err.statusCode === 400 ? 400 : 500).json({
      success: false,
      error: tooBig ? `Screenshot must be ${MAX_SCREENSHOT_MB} MB or smaller` : err.message,
    });
  });
};

const validateReportIssue = (body) => {
  const REQUIRED = ['issueTitle', 'description'];
  for (const field of REQUIRED) {
    if (!body[field] || !String(body[field]).trim()) {
      throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
    }
  }
};

export const submitReportIssue = async (req, res) => {
  try {
    validateReportIssue(req.body);
    const issue = await reportIssueService.createReportIssue({
      ...req.body,
      // The DB column holds the STORED FILENAME, not a URL — see the service.
      screenshotFile: req.file?.filename ?? null,
    });
    res.status(201).json({ success: true, id: issue.id, hasScreenshot: Boolean(req.file) });
  } catch (err) {
    // A rejected submission must not leave its upload behind on disk.
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    const status = err.statusCode || 500;
    if (status === 500) logger.error({ err }, 'Report issue submission failed');
    res.status(status).json({ success: false, error: err.message });
  }
};

export const listReportIssues = async (_req, res) => {
  try {
    res.json(await reportIssueService.listReportIssues());
  } catch (err) {
    logger.error({ err }, 'Report issue listing failed');
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /report-issue/:id/screenshot — admin only.
 *
 * Streams the image rather than redirecting to a static path, so the file is
 * never reachable without passing this route's authentication.
 */
export const getReportIssueScreenshot = async (req, res) => {
  try {
    const issue = await reportIssueService.getReportIssue(req.params.id);
    if (!issue?.screenshotUrl) return res.status(404).json({ error: 'No screenshot on this report' });

    // basename() is the guard that makes a stored value like "../../.env"
    // resolve inside SCREENSHOT_DIR instead of escaping it.
    const filePath = path.join(SCREENSHOT_DIR, path.basename(issue.screenshotUrl));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Screenshot missing from storage' });

    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'Failed to serve issue screenshot');
    res.status(500).json({ error: 'Failed to load screenshot' });
  }
};
