// backend/src/controllers/agentRuntime.controller.js
/**
 * HTTP layer for the agent conversation runtime (Chat Test + Web Call).
 *
 *   POST /workspaces/:workspaceId/agents/:agentId/converse    – text turn
 *   POST /workspaces/:workspaceId/agents/:agentId/speak       – text → TTS audio
 *   POST /workspaces/:workspaceId/agents/:agentId/voice-turn  – audio → STT → reply → TTS
 */

import multer from 'multer';
import logger from '../lib/logger.js';
import * as runtime from '../services/agentRuntime.service.js';

const sendError = (res, err, fallbackMsg) => {
  const status = err.statusCode || 500;
  if (status >= 500) logger.error(fallbackMsg, err);
  res.status(status).json({ error: err.message || fallbackMsg });
};

// Audio segments from the browser recorder are small; 15MB is generous.
export const uploadVoiceTurnAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
}).single('audio');

// POST .../converse  { messages: [{role, content}, ...] }
export const converse = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const { messages, voiceMode } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    const { reply, provider, model } = await runtime.converse(
      workspaceId, agentId, messages, { voiceMode: Boolean(voiceMode) }
    );
    res.json({ success: true, reply, provider, model });
  } catch (err) {
    sendError(res, err, 'Agent converse failed');
  }
};

// GET .../welcome — welcome message with [placeholders] resolved from the KB
export const welcome = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const out = await runtime.getRenderedWelcome(workspaceId, agentId);
    res.json({ success: true, ...out });
  } catch (err) {
    sendError(res, err, 'Agent welcome rendering failed');
  }
};

// POST .../speak  { text }
export const speak = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    const out = await runtime.speakAsAgent(workspaceId, agentId, text.trim().slice(0, 1000));
    res.json({ success: true, ...out });
  } catch (err) {
    sendError(res, err, 'Agent speak failed');
  }
};

// POST .../speak-stream  { text }
export const speakStream = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const out = await runtime.streamSpeechAsAgent(
      workspaceId,
      agentId,
      text.trim().slice(0, 1000)
    );
    res.status(200);
    res.set({
      'Content-Type': out.contentType,
      'Cache-Control': 'no-store',
      'X-Voice-Used': encodeURIComponent(out.voiceUsed),
    });
    res.flushHeaders();
    out.stream.on('error', (err) => {
      logger.warn(`Agent speech stream failed: ${err.message}`);
      res.destroy(err);
    });
    out.stream.pipe(res);
  } catch (err) {
    if (res.headersSent) return res.destroy(err);
    sendError(res, err, 'Agent speech stream failed');
  }
};

// POST .../voice-turn  multipart: audio (blob), history (JSON string)
export const voiceTurn = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ error: 'An audio file is required (field "audio")' });
    }
    let history = [];
    if (req.body.history) {
      try { history = JSON.parse(req.body.history); } catch { /* ignore malformed */ }
    }
    const streamTts = req.body.streamTts === 'true' || req.body.streamTts === true;
    const out = await runtime.voiceTurn(
      workspaceId,
      agentId,
      req.file.buffer,
      req.file.mimetype || 'audio/webm',
      Array.isArray(history) ? history : [],
      { synthesize: !streamTts }
    );
    if (out.timings) {
      res.set('Server-Timing', [
        `stt;dur=${out.timings.sttMs}`,
        `llm;dur=${out.timings.llmMs}`,
        `tts;dur=${out.timings.ttsMs}`,
      ].join(', '));
    }
    res.json({ success: true, ...out });
  } catch (err) {
    sendError(res, err, 'Agent voice turn failed');
  }
};
