import path from 'path';
import fs from 'fs';
import prisma from '../config/prisma.js';
import * as sarvamService from '../services/sarvam.service.js';
import { geminiService } from '../services/gemini.service.js';
import { invalidateAgentRuntimeCaches } from '../services/agentRuntime.service.js';
import { deleteKbChunks } from '../services/kbChunking.service.js';
import logger from '../lib/logger.js';
import { assertCanStartCall } from '../services/billing/settlement.service.js';
import { placeOutboundCall, resolveCallMode, telephonyStatusForNumber, warmInboundGreetingIfAnswering } from '../services/outboundCall.service.js';
import { assertComplianceReady } from '../services/compliance/compliance.service.js';
import fetch from 'node-fetch';
import { env } from '../config/env.js';
import { isModelAllowed, labelFor } from '../services/platform/modelCatalog.js';
import { AGENT_DIRECTION, agentDirection, directionChangeConflict, normaliseDirection } from '../services/agentDirection.js';
import { VOICE_NUMBER_STATUS } from '../constants/compliance.js';
import { validateAgentSettings } from '../validators/agentSettings.validator.js';
import { inheritedModelFields, sameLanguages, stripClientModelFields } from '../validators/agentModelFields.js';
import { voiceNameFromLabel } from '../services/voice/voicePicker.js';

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

/**
 * Reject a save that selects a voice whose provider Super Admin has switched off.
 *
 * The voice is the one model-backed choice a client still makes (the LLM and
 * transcription are assigned, and stripClientModelFields removes them from the
 * payload before this runs). Hiding a provider in the picker is not access
 * control: the same save can be issued straight at the API. This is the gate
 * that actually holds.
 *
 * It only rejects a voice that is CHANGING. The agent editor re-sends every
 * field on every save, so gating on the payload alone would make an agent whose
 * provider was switched off unsaveable — renaming it would fail with a
 * complaint about its voice.
 *
 * @param {object} columns  agent-column fields from this request
 * @param {object} extras   settings-JSON fields from this request
 * @param {object|null} existing  the agent as currently stored, for updates
 * @returns {Promise<string|null>} an error message, or null when the save is fine
 */
const findDisabledModel = async (columns, extras, existing = null) => {
  // The voice column is stored as "<Provider> - <Voice name>" — the provider is
  // what the catalogue gates.
  const providerOf = (label) => (typeof label === 'string' && label.includes(' - ')
    ? label.split(' - ')[0].trim()
    : null);
  const prior = providerOf(existing?.voice);
  const voiceProvider = extras.voiceProvider ?? providerOf(columns.voice);

  if (!voiceProvider) return null;
  if (prior && prior.toLowerCase() === voiceProvider.toLowerCase()) return null;
  if (!(await isModelAllowed('tts', voiceProvider))) {
    return `"${labelFor('tts', voiceProvider)}" is not available on this platform. Contact your administrator.`;
  }
  return null;
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
    // What the client shows for the voice: its name, never the provider that
    // `voice` ("Provider - Name") still carries for the runtime.
    voiceName: voiceNameFromLabel(agent.voice),
  };
};

export const createAgent = async (req, res) => {
  const { workspaceId } = req.params;
  const data = req.body;

  try {
    // `copyOf` names an agent in this workspace whose models the new one keeps
    // (EditAgent's "Create an Inbound/Outbound copy"). Not a stored field.
    const { copyOf, ...body } = data ?? {};
    const split = splitAgentPayload(body);
    const { languages, flowItems } = split;
    const { columns, extras: rawExtras } = stripClientModelFields(split);
    const validated = validateAgentSettings(rawExtras);
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    const extras = validated.extras;

    // Every new agent is built for one direction, chosen when it is created.
    // Agents without one predate the choice; see services/agentDirection.js.
    if (!normaliseDirection(extras.callDirection)) {
      return res.status(400).json({
        error: 'Choose whether this agent answers calls (Inbound) or places them (Outbound).',
      });
    }

    const disabled = await findDisabledModel(columns, extras);
    if (disabled) return res.status(403).json({ error: disabled });

    // A new agent is created with NO model of its own, so it runs whatever
    // Super Admin assigned (client override, else platform default). Empty
    // rather than omitted: `transcription` has a column default of "Azure",
    // and a non-empty value is exactly what marks an agent as having kept its
    // own model (modelAssignments.js).
    let models = { columns: { aiModel: '', transcription: '' }, settings: {} };
    if (copyOf) {
      const source = await prisma.agent.findFirst({
        where: { id: String(copyOf), workspaceId },
        select: { aiModel: true, transcription: true, settings: true },
      });
      if (!source) return res.status(404).json({ error: 'The agent being copied was not found in this workspace' });
      models = inheritedModelFields(source);
    }

    const agent = await prisma.agent.create({
      data: {
        ...columns,
        ...models.columns,
        languages: JSON.stringify(languages ?? []),
        flowItems: flowItems == null ? null : JSON.stringify(flowItems),
        settings: JSON.stringify({ ...extras, ...models.settings }),
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

    const split = splitAgentPayload(data);
    const { languages, flowItems } = split;
    // Never written by a client save: the agent keeps whatever model it has.
    const { columns, extras: rawExtras } = stripClientModelFields(split);
    const validated = validateAgentSettings(rawExtras);
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    const extras = validated.extras;

    const disabled = await findDisabledModel(columns, extras, existing);
    if (disabled) return res.status(403).json({ error: disabled });

    // A direction cannot change under a number or a campaign still using it.
    const conflict = await directionChangeConflict(existing, extras.callDirection);
    if (conflict) return res.status(409).json({ error: conflict, code: 'AGENT_DIRECTION_IN_USE' });

    const mergedSettings = { ...safeJson(existing.settings, {}), ...extras };
    // A saved STT language used to be set in the Transcription picker, which
    // clients no longer have. Once they change the agent's languages, a value
    // left behind would keep transcribing the OLD language with nothing on
    // screen to fix it, so it goes and the recogniser follows the new first
    // language. Unchanged languages leave an older agent's setting as it was.
    if (languages != null && !sameLanguages(languages, existing.languages)) {
      delete mergedSettings.sttLanguage;
    }

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
    // After the response, on purpose: an edited greeting (or voice) is a new
    // cache key, and an agent answering a rented number should not make its next
    // caller wait on the synthesis. Does nothing for an agent on no number.
    warmInboundGreetingIfAnswering(req.params.workspaceId, agentId);
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
          select: { id: true, storedPath: true },
        }),
        prisma.agentCallLog.findMany({
          where: { workspaceId, agentId },
          select: { recordingPath: true },
        }),
      ]);
      await Promise.all([
        prisma.kbFile.deleteMany({ where: { workspaceId, agentId } }),
        prisma.agentCallLog.deleteMany({ where: { workspaceId, agentId } }),
        // A KbChunk has no FK back to its KbFile (Prisma cannot declare one
        // through the Unsupported vector column), so deleting the files alone
        // left every chunk and its 1536-dim embedding behind for good. Same
        // cleanup the single-file delete does.
        ...kbFiles.map((f) => deleteKbChunks(f.id)),
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
  // Caller ID: use the number chosen in the "Call from" picker when supplied,
  // otherwise fall back to the platform default. Twilio rejects an unowned/
  // unverified number with error 21210, which this handler surfaces honestly.
  const fromNumber = req.body.fromNumber || process.env.TWILIO_FROM_NUMBER;

  if (!agentId || !phoneNumber) {
    return res.status(400).json({ error: 'agentId and phoneNumber are required' });
  }

  // Honest behavior: if telephony isn't configured, say so — never fake success.
  //
  // Asked of the carrier THIS caller ID dials through, and whether this
  // workspace may dial from it at all — the same pre-flight the campaign runner
  // uses. It asked the platform default carrier, so a Plivo number on a box with
  // Twilio configured passed here and then failed at the dial.
  const tw = await telephonyStatusForNumber(fromNumber, { workspaceId });
  if (!tw.ready) {
    const status = tw.code === 'CALLER_ID_NOT_OWNED' ? 403 : 503;
    return res.status(status).json({ success: false, error: tw.error, code: tw.code });
  }

  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found in this workspace' });

  // A test call DIALS the tester, so on an Inbound agent it would test an
  // outbound conversation the agent is never allowed to have. Point at the two
  // tests that do exercise it. placeOutboundCall refuses it too; this is here
  // for the more useful message.
  if (agentDirection(agent) === AGENT_DIRECTION.INBOUND) {
    const number = await prisma.voiceNumber.findFirst({
      where: { workspaceId, inboundAgentId: agent.id, status: VOICE_NUMBER_STATUS.ACTIVE },
      select: { phoneNumber: true },
    }).catch(() => null);
    return res.status(409).json({
      success: false,
      code: 'AGENT_IS_INBOUND',
      error: number
        ? `"${agent.name}" is an Inbound agent, so it can't call you. Test it by calling ${number.phoneNumber}, or with a web call.`
        : `"${agent.name}" is an Inbound agent, so it can't call you. Test it with a web call, or assign it a number on the Phone Numbers page and call that.`,
    });
  }

  logger.info({ agentId, phoneNumber }, 'Initiating REAL test call');

  const { mode, reason } = await resolveCallMode(agent);
  const useBundledEngine = mode === 'conversation';
  if (reason) logger.warn(reason);

  // BUG-002: plan + balance gate for TELEPHONY, before Twilio is asked to
  // dial. Placing it here rather than in the media-stream handler matters:
  // by the time that socket opens the call is already connected and the
  // carrier leg is already billable to us, so refusing there would cost real
  // money on a call we did not want to allow.
  const gate = await assertCanStartCall(workspaceId, { type: 'PHONE_CALL' });
  if (!gate.allowed) {
    logger.info({ workspaceId, agentId, code: gate.code }, `Phone call blocked: ${gate.code}`);
    return res.status(402).json({ error: gate.message, code: gate.code });
  }

  // DLT, as the campaign runner applies it. A test call to your own phone is
  // still a call from that caller ID: a suspended workspace must not place it,
  // and under DLT_COMPLIANCE_MODE=enforce neither may an unregistered one. In the
  // default `warn` mode this refuses only a suspended workspace or number.
  const dlt = await assertComplianceReady(workspaceId, { fromNumber });
  if (!dlt.allowed) {
    logger.info({ workspaceId, agentId, code: dlt.code }, `Phone call blocked: ${dlt.code}`);
    return res.status(403).json({ success: false, error: dlt.message, code: dlt.code });
  }

  const result = await placeOutboundCall({
    workspaceId,
    agent,
    toNumber: phoneNumber,
    fromNumber,
    closingLine: useBundledEngine ? '' : 'This was a test call. Goodbye.',
  });

  if (!result.ok) {
    return res.status(result.status || 502).json({ success: false, error: result.error });
  }

  // Be explicit about which kind of call this is. A greeting-only call has no
  // two-way conversation, so NO variables can be extracted and nothing will be
  // delivered to Post-Call destinations (webhook/email/Google Sheets). Surface
  // that here instead of returning a bare "success" that looks like a full call.
  const message = useBundledEngine
    ? `Calling ${phoneNumber} — your phone should ring shortly for a live conversation with ${agent.name}.`
    : `Calling ${phoneNumber} — your phone will ring with ${agent.name}'s greeting only. `
      + `This is a one-way test call: no variables will be extracted and nothing will be sent to your Post-Call sheet. `
      + `To get a real conversation (and sheet delivery), set PUBLIC_BACKEND_WS_URL to a public wss:// URL for this backend and use a Conversational Agent (xAI/ElevenLabs) voice engine.`;

  return res.json({
    success: true,
    callSid: result.callSid,
    mode: useBundledEngine ? 'conversation' : 'greeting-only',
    variablesWillExtract: useBundledEngine,
    message,
  });
};
