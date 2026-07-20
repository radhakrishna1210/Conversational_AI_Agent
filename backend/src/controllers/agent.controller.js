import path from 'path';
import fs from 'fs';
import prisma from '../config/prisma.js';
import * as sarvamService from '../services/sarvam.service.js';
import { geminiService } from '../services/gemini.service.js';
import { invalidateAgentRuntimeCaches } from '../services/agentRuntime.service.js';
import logger from '../lib/logger.js';
import fetch from 'node-fetch';
import { env } from '../config/env.js';

// Same storage locations the KB-file and call-log controllers write to —
// needed so deleting an agent can also remove its files from disk.
const KB_FILES_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'kb-files');
const RECORDINGS_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'call-recordings');

const safeJson = (value, fallback = []) => {
  if (value == null) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

// Whitelist of real Agent columns; everything else the client sends
// (call configuration, post-call configs, UI extras) is packed into the
// `settings` JSON column instead of being silently dropped or — worse —
// crashing Prisma with "Unknown argument".
const AGENT_COLUMNS = new Set([
  'name', 'welcomeMessage', 'aiModel', 'voice', 'transcription',
  'maxDuration', 'silenceTimeout', 'dynamicEnabled', 'interruptibleEnabled',
]);

const splitAgentPayload = (data = {}) => {
  const { id, createdAt, updatedAt, workspaceId, languages, selectedLanguages, flowItems, settings, ...rest } = data;
  const columns = {};
  const extras = typeof settings === 'object' && settings ? { ...settings } : {};
  for (const [k, v] of Object.entries(rest)) {
    if (AGENT_COLUMNS.has(k)) columns[k] = v;
    else extras[k] = v; // e.g. postCallConfigs, transferNumber, speakingRate…
  }
  return { columns, extras, languages: languages ?? selectedLanguages, flowItems };
};

const serializeAgent = (agent) => {
  const settings = safeJson(agent.settings, {});
  return {
    ...(typeof settings === 'object' && settings ? settings : {}),
    ...agent,
    settings: undefined,
    // call-config/post-call fields surface at top level for the client
    ...(typeof settings === 'object' && settings ? settings : {}),
    languages: safeJson(agent.languages, []),
    selectedLanguages: safeJson(agent.languages, []),
    flowItems: safeJson(agent.flowItems, null),
  };
};

export const createAgent = async (req, res) => {
  const { workspaceId } = req.params;
  const data = req.body;

  try {
    const { columns, extras, languages, flowItems } = splitAgentPayload(data);

    const agent = await prisma.agent.create({
      data: {
        ...columns,
        languages: JSON.stringify(languages ?? []),
        flowItems: flowItems == null ? null : JSON.stringify(flowItems),
        settings: JSON.stringify(extras),
        workspaceId,
      },
    });
    res.status(201).json(serializeAgent(agent));
  } catch (error) {
    logger.error('Failed to create agent', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
};

export const getAgents = async (req, res) => {
  const { workspaceId } = req.params;

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  try {
    const agents = await prisma.agent.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(agents.map(serializeAgent));
  } catch (error) {
    logger.error('Failed to get agents', error);
    res.status(500).json({ error: 'Failed to get agents' });
  }
};

export const getAgent = async (req, res) => {
  const { agentId } = req.params;

  try {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, workspaceId: req.params.workspaceId },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(serializeAgent(agent));
  } catch (error) {
    logger.error('Failed to get agent', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
};

export const updateAgent = async (req, res) => {
  const { agentId } = req.params;
  const data = req.body;

  try {
    // Ownership check: never allow updating an agent from another workspace.
    const existing = await prisma.agent.findFirst({ where: { id: agentId, workspaceId: req.params.workspaceId } });
    if (!existing) return res.status(404).json({ error: 'Agent not found in this workspace' });

    const { columns, extras, languages, flowItems } = splitAgentPayload(data);
    const mergedSettings = { ...safeJson(existing.settings, {}), ...extras };

    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: {
        ...columns,
        languages: languages != null ? JSON.stringify(languages) : undefined,
        flowItems: flowItems == null ? undefined : JSON.stringify(flowItems),
        settings: JSON.stringify(mergedSettings),
      },
    });
    // A saved config (new voice, welcome, flow…) must apply to the very next
    // call — don't let the runtime's short-TTL caches serve the old config.
    invalidateAgentRuntimeCaches(req.params.workspaceId, agentId);
    res.json(serializeAgent(agent));
  } catch (error) {
    logger.error('Failed to update agent', error, { agentId });
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

export const deleteAgent = async (req, res) => {
  const { agentId, workspaceId } = req.params;

  try {
    const del = await prisma.agent.deleteMany({
      where: { id: agentId, workspaceId },
    });
    if (del.count === 0) return res.status(404).json({ error: 'Agent not found in this workspace' });

    // Purge everything that belonged to this agent: KB files LINKED to it
    // (workspace-wide files with agentId null are kept), its call history,
    // and both sets of stored files on disk. The agent row is already gone,
    // so cleanup failures are logged but never fail the request.
    try {
      const [kbFiles, callLogs] = await Promise.all([
        prisma.kbFile.findMany({
          where: { workspaceId, agentId },
          select: { storedPath: true },
        }),
        prisma.agentCallLog.findMany({
          where: { workspaceId, agentId },
          select: { recordingPath: true },
        }),
      ]);
      await Promise.all([
        prisma.kbFile.deleteMany({ where: { workspaceId, agentId } }),
        prisma.agentCallLog.deleteMany({ where: { workspaceId, agentId } }),
      ]);
      for (const f of kbFiles) {
        if (f.storedPath) fs.unlink(path.join(KB_FILES_DIR, path.basename(f.storedPath)), () => {});
      }
      for (const c of callLogs) {
        if (c.recordingPath) fs.unlink(path.join(RECORDINGS_DIR, path.basename(c.recordingPath)), () => {});
      }
      invalidateAgentRuntimeCaches(workspaceId, agentId);
      logger.info(`Agent ${agentId} deleted with ${kbFiles.length} KB file(s) and ${callLogs.length} call log(s)`);
    } catch (cleanupError) {
      logger.warn(`Agent ${agentId} deleted, but related-data cleanup failed: ${cleanupError.message}`);
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete agent', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
};

/**
 * Chat endpoint for multilingual AI responses
 * POST /api/v1/agents/:agentId/chat
 */
export const chat = async (req, res) => {
  const { agentId } = req.params;
  const { message, selectedLanguages, welcomeMessage } = req.body;

  // Validate input
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!Array.isArray(selectedLanguages) || selectedLanguages.length === 0) {
    return res.status(400).json({ error: 'At least one language must be selected' });
  }

  try {
    let agent = null;
    if (process.env.DB_STATUS !== 'unavailable') {
      try {
        agent = await prisma.agent.findUnique({
          where: { id: agentId },
        });
      } catch (dbErr) {
        logger.warn({ dbErr: dbErr.message }, 'Failed to fetch agent from DB for chat context');
      }
    }

    let flowItems = [];
    if (agent && agent.flowItems) {
      flowItems = safeJson(agent.flowItems, []);
    }

    const agentContext = {
      name: agent?.name || 'AI Assistant',
      welcomeMessage: agent?.welcomeMessage || welcomeMessage || 'Hello!',
      aiModel: agent?.aiModel || 'sarvam-30b',
      voice: agent?.voice || 'Google',
      transcription: agent?.transcription || 'Azure',
      languages: selectedLanguages,
      flowItems,
    };

    logger.debug(
      { agentId, messageLength: message.length, languages: selectedLanguages, hasFlow: flowItems.length > 0 },
      'Chat request received'
    );

    // Load KB files grounding text for this agent
    let kbGrounding = '';
    try {
      const kbRows = await prisma.kbFile.findMany({
        where: { workspaceId: agent?.workspaceId ?? req.params.workspaceId, OR: [{ agentId }, { agentId: null }], textContent: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const budget = 12_000;
      let used = 0;
      const sections = [];
      for (const f of kbRows) {
        if (used >= budget) break;
        const slice = (f.textContent || '').slice(0, Math.min(4000, budget - used));
        used += slice.length;
        sections.push(`### ${f.fileName}\n${slice}`);
      }
      if (sections.length > 0) kbGrounding = `# KNOWLEDGE BASE\nOnly use facts from the sources below. If the answer isn't here, say you don't have that information.\n\n${sections.join('\n\n')}`;
    } catch (e) {
      logger.warn({ e: e.message }, 'KB grounding load failed — proceeding without KB');
    }

    // Build the agent's real persona from its configured flow items so that
    // agent configuration actually drives behavior (previously ignored).
    const enabledFlow = (Array.isArray(flowItems) ? flowItems : [])
      .filter((f) => f && f.enabled !== false && (f.body || f.title))
      .map((f) => `## ${f.title ?? 'Instruction'}\n${f.body ?? ''}`)
      .join('\n\n');

    const systemPrompt = `You are "${agentContext.name}", a voice assistant speaking with a caller in real time.

${enabledFlow ? `# AGENT CONFIGURATION\n${enabledFlow}\n` : `# CONTEXT\n${agentContext.welcomeMessage}\n`}
${kbGrounding ? `\n${kbGrounding}\n` : ''}
# VOICE & HUMAN-LIKE STYLE (very important — your words will be spoken aloud)
- Speak like a warm, attentive human on a phone call: short sentences, contractions, natural rhythm.
- Keep turns brief (1–3 sentences). Never read out lists, markdown, URLs, or code.
- React with genuine, proportionate emotion: acknowledge frustration ("Oh no, I'm sorry that happened"), share small delight ("Oh nice!"), express empathy before solutions.
- Occasionally use natural discourse markers ("Sure thing", "Hmm, let me check", "Got it") — sparingly, like a real person, not every turn.
- Ask one question at a time. Confirm understanding before acting on important details (names, numbers, dates).
- If interrupted or the caller changes topic, follow them gracefully.

# LANGUAGE
Detect the caller's language and reply in that same language. Preferred languages for this agent: ${selectedLanguages.join(', ')}.`;

    // Generate response using Gemini
    const response = await geminiService.generateResponse({
      message,
      model: 'gemini-2.5-flash',
      systemPrompt: systemPrompt
    });

    if (!response.success) {
      throw new Error(response.error || 'Gemini API failed to generate response');
    }

    logger.debug(
      { agentId, replyLength: response.message ? response.message.length : 0 },
      'Chat response generated'
    );

    res.json({
      reply: response.message,
      detectedLanguage: 'Auto-detected by Gemini',
      model: response.model,
      tokensUsed: 0,
      timestamp: response.timestamp,
    });
  } catch (err) {
    logger.error({ agentId, error: err.message }, 'Chat error');
    res.status(500).json({
      error: 'Failed to generate response',
      details: err.message,
    });
  }
};

/**
 * Health check for Sarvam AI
 * GET /api/v1/agents/health/sarvam
 */
export const checkSarvamHealth = async (req, res) => {
  try {
    const isHealthy = await sarvamService.checkSarvamHealth();
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      sarvamUrl: process.env.SARVAM_URL || 'https://api.sarvam.ai/api/v1',
    });
  } catch (err) {
    logger.error({ error: err.message }, 'Sarvam AI health check failed');
    res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
};

/**
 * Initiate an outbound voice test call using Twilio, falling back to a simulation.
 * POST /api/v1/workspaces/:workspaceId/agents/test-call
 */
export const testCall = async (req, res) => {
  const { agentId, phoneNumber } = req.body;
  const { workspaceId } = req.params;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!agentId || !phoneNumber) {
    return res.status(400).json({ error: 'agentId and phoneNumber are required' });
  }

  // Honest behavior: if telephony isn't configured, say so — never fake success.
  if (!accountSid || !authToken) {
    return res.status(503).json({
      success: false,
      error: 'Phone calling is not configured on this server (missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN). Use the Chat Test tab to test the agent, or configure Twilio.',
    });
  }
  if (!fromNumber) {
    return res.status(503).json({
      success: false,
      error: 'TWILIO_FROM_NUMBER is not set. Add a Twilio phone number you own to backend/.env.',
    });
  }

  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found in this workspace' });

  logger.info({ agentId, phoneNumber }, 'Initiating REAL test call');

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const agentSettings = (() => { try { return JSON.parse(agent.settings || '{}'); } catch { return {}; } })();
    const isBundledEngine = agentSettings.voiceEngine === 'xai' || agentSettings.voiceEngine === 'elevenlabs';
    const useBundledEngine = isBundledEngine && Boolean(env.PUBLIC_BACKEND_WS_URL);
    if (isBundledEngine && !env.PUBLIC_BACKEND_WS_URL) {
      logger.warn(`Agent uses the ${agentSettings.voiceEngine} Conversational Agent but PUBLIC_BACKEND_WS_URL is not configured — falling back to the greeting-only test call`);
    }

    let twiml;
    let greeting = '';
    // Pre-create the call log so its id can be handed to the Twilio Media
    // Stream bridge (as a <Parameter>) for the bundled-engine branch to update in place.
    const preCallLog = await prisma.agentCallLog.create({
      data: { workspaceId, agentId, type: 'PHONE_CALL', status: 'INITIATED', phoneNumber: String(phoneNumber).slice(0, 32) },
    }).catch((e) => { logger.warn(`Could not pre-create phone call log: ${e.message}`); return null; });

    if (useBundledEngine) {
      // Full two-way conversation: hand the call off to the bundled Conversational
      // Agent bridge (backend/src/ws/twilioMediaRealtime.handler.js) via Twilio Media Streams.
      const streamUrl = `${env.PUBLIC_BACKEND_WS_URL.replace(/\/$/, '')}/api/v1/twilio-media/${workspaceId}/${agentId}`;
      twiml = `<Response><Connect><Stream url="${streamUrl}">${preCallLog ? `<Parameter name="callLogId" value="${preCallLog.id}" />` : ''}</Stream></Connect></Response>`;
    } else {
      // Speak the agent's actual greeting via inline TwiML (no external URL).
      // Full two-way conversational calling (the modular pipeline) requires a
      // media-stream server; this verifies telephony + the agent's greeting
      // end-to-end. (Enable a Conversational Agent for a real two-way call.)
      greeting = (agent.welcomeMessage || `Hello, this is a test call from ${agent.name}.`)
        .replace(/[<>&]/g, ' ')
        .slice(0, 800);
      twiml = `<Response><Say voice="Polly.Aditi">${greeting}</Say><Pause length="1"/><Say voice="Polly.Aditi">This was a test call. Goodbye.</Say></Response>`;
    }

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phoneNumber, From: fromNumber, Twiml: twiml }),
    });

    const dataText = await response.text();
    let dataJson = {}; try { dataJson = JSON.parse(dataText); } catch { /* not json */ }

    if (!response.ok) {
      logger.warn({ status: response.status, dataJson }, 'Twilio call request failed');
      if (preCallLog) await prisma.agentCallLog.update({ where: { id: preCallLog.id }, data: { status: 'FAILED', endedAt: new Date() } }).catch(() => {});
      return res.status(502).json({
        success: false,
        error: `Twilio rejected the call: ${dataJson.message || response.status}. Check your Twilio number, account balance, and destination format (+countrycode...).`,
      });
    }

    // Non-bundled branch: nothing else will update this log, so record the
    // one-way greeting now. The bundled-engine branch is finalized by the media bridge.
    if (!useBundledEngine && preCallLog) {
      await prisma.agentCallLog.update({
        where: { id: preCallLog.id },
        data: { transcript: JSON.stringify([{ role: 'assistant', content: greeting }]), endedAt: new Date() },
      }).catch((e) => logger.warn(`Could not log phone test call: ${e.message}`));
    }

    return res.json({
      success: true,
      callSid: dataJson.sid,
      message: `Calling ${phoneNumber} — your phone should ring shortly with ${agent.name}'s greeting.`,
    });
  } catch (err) {
    logger.error('testCall failed', err);
    return res.status(502).json({ success: false, error: `Call failed: ${err.message}` });
  }
};
