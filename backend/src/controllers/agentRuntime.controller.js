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
import { resolveAgentVoice } from '../services/voice.service.js';
import { describeTtsCapabilities } from '../services/voice/ttsStreamFactory.js';
import { turnEndProfileFor, turnEndProfileList, maxCommitMsFor, DEFAULT_TURN_END_PROFILE } from '../services/voice/turnEndProfile.js';

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

// GET .../welcome[?direction=outbound|inbound]
//   welcome message with [placeholders] resolved from the KB.
//
// `direction` is optional and describes the call the caller is ABOUT to make,
// so a web test call placed against an outbound agent hears the same opener the
// dialler would produce. Omitted (the Assistant Details preview) it falls back
// to the agent's configured callDirection, which is the previous behaviour.
export const welcome = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const raw = String(req.query.direction || '').toUpperCase();
    const direction = raw === 'OUTBOUND' || raw === 'INBOUND' ? raw : null;
    const out = await runtime.getRenderedWelcome(workspaceId, agentId, { direction });
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

// POST .../voice-turn-stream  multipart: audio (blob), history (JSON string)
// B1 streaming turn: responds with newline-delimited JSON (application/x-ndjson).
// Each line is one event from runtime.voiceTurnStream — a transcript, then one
// `sentence` per synthesized sentence (audio arrives while the reply is still
// being generated), then a final `done` with timings.
export const voiceTurnStream = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ error: 'An audio file is required (field "audio")' });
    }
    let history = [];
    if (req.body.history) {
      try { history = JSON.parse(req.body.history); } catch { /* ignore malformed */ }
    }

    res.status(200);
    res.set({
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      // Disable proxy buffering so each sentence reaches the browser immediately.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // The only consumer that has to serialize audio as text. The WS transports
    // take the Buffer straight through; here it must survive JSON.stringify,
    // which would otherwise turn it into { type: 'Buffer', data: [...] }.
    const write = (event) => {
      if (res.writableEnded) return;
      const line = event?.type === 'audio-chunk' && Buffer.isBuffer(event.chunk)
        ? { type: 'audio-chunk', data: event.chunk.toString('base64') }
        : event;
      res.write(`${JSON.stringify(line)}\n`);
    };

    await runtime.voiceTurnStream(
      workspaceId,
      agentId,
      req.file.buffer,
      req.file.mimetype || 'audio/webm',
      Array.isArray(history) ? history : [],
      { onEvent: write }
    );
    res.end();
  } catch (err) {
    // Headers are already sent once streaming starts — surface the error as a
    // final NDJSON line instead of a (now impossible) JSON error response.
    if (res.headersSent) {
      try { res.write(`${JSON.stringify({ type: 'error', message: err.message })}\n`); } catch { /* socket gone */ }
      return res.end();
    }
    sendError(res, err, 'Agent streaming voice turn failed');
  }
};

/**
 * GET .../response-profile
 *
 * Everything the agent editor needs to let someone tune this agent's response
 * speed WITHOUT guessing: the profiles they can pick from (with the actual
 * milliseconds each one waits), and what the voice they have currently selected
 * can really do.
 *
 * That second half is the point. Whether the agent can stream its reply as the
 * words are generated — the difference between a reply that starts in ~600ms
 * and one that starts after a whole sentence has been synthesized — depends
 * entirely on which voice provider the workspace picked, and until now there
 * was no way to find that out except by reading the server logs. So the editor
 * asks, and shows the answer next to the control.
 *
 * Nothing here recommends a provider or a profile. It reports what the current
 * choice does, and the choice stays the user's.
 */
export const responseProfile = async (req, res) => {
  try {
    const { workspaceId, agentId } = req.params;
    const agent = await runtime.loadAgent(workspaceId, agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found in this workspace' });

    let settings = {};
    try { settings = JSON.parse(agent.settings || '{}') || {}; } catch { /* defaults */ }

    // `?voice=` lets the editor ask about a voice the user has just PICKED but
    // not yet saved, so the capability note under the control updates as they
    // browse voices instead of only after a save. Falls back to what is stored.
    const candidate = typeof req.query.voice === 'string' && req.query.voice.trim()
      ? req.query.voice.trim()
      : agent.voice;
    // A voice that cannot be resolved (never picked, or a clone whose upstream
    // id went missing) is not an error here — the editor still needs the rest.
    const voice = await resolveAgentVoice(candidate).catch(() => null);
    const capabilities = voice
      ? describeTtsCapabilities(voice)
      : {
        providerName: null,
        tokenStreaming: false,
        ssmlBreaks: false,
        deliveryMode: 'http',
        reason: 'No voice is selected for this agent yet.',
      };

    const profile = turnEndProfileFor(settings);
    res.json({
      turnEnd: {
        selected: settings.turnEndSensitivity || DEFAULT_TURN_END_PROFILE,
        profiles: turnEndProfileList(),
        // What the agent will actually use, env overrides included — so an
        // operator override is visible rather than making the UI look wrong.
        effective: { ...profile, maxCommitMs: maxCommitMsFor(profile) },
      },
      ttsDelivery: {
        selected: ['auto', 'socket', 'http'].includes(settings.ttsDelivery)
          ? settings.ttsDelivery
          : 'auto',
        // Platform kill switch. When an operator has taken the streaming path
        // out of service, say so instead of showing a control that does nothing.
        available: process.env.VOICE_TTS_OVERLAP !== 'false',
        voice: capabilities,
      },
    });
  } catch (err) {
    sendError(res, err, 'Failed to load the agent response profile');
  }
};
