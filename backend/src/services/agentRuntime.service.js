// backend/src/services/agentRuntime.service.js
/**
 * Agent conversation runtime — the single "brain" behind both the Chat Test
 * and the Web Call. Builds the system prompt server-side from the agent's
 * stored configuration (welcome message, conversational flow, settings) plus
 * the workspace/agent knowledge base, then generates a grounded reply with
 * full multi-turn history.
 *
 * Previously the chat test built its prompt in the browser and the web call
 * was a UI mock; both now share this module so their behavior is identical.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { logTurnLatency } from '../lib/latencyLog.js';
import { getLLMProviderWithFallback } from './llm.factory.js';
import { mapAgentModel } from '../controllers/llm.controller.js';
import { DEFAULT_TEMPERATURE } from '../constants/llmModels.js';
import { resolveAgentVoice, streamSynthesizeVoice } from './voice.service.js';
import { transcribeAudio } from './stt.service.js';

const safeJson = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

// ─── Short-TTL caches ─────────────────────────────────────────────────────────
// A web call issues a turn every few seconds; re-reading the agent row and KB
// from the remote DB on every stage added ~1-2s per turn. Config edits take
// effect within the TTL, which is fine for a live call.
const AGENT_TTL_MS = 15_000;
const KB_TTL_MS = 30_000;
const agentCache = new Map(); // `${workspaceId}:${agentId}` -> { agent, at }
const kbCache = new Map();    // `${workspaceId}:${agentId}` -> { value, at }

async function loadAgent(workspaceId, agentId) {
  const key = `${workspaceId}:${agentId}`;
  const hit = agentCache.get(key);
  if (hit && Date.now() - hit.at < AGENT_TTL_MS) return hit.agent;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
  if (agent) agentCache.set(key, { agent, at: Date.now() });
  return agent;
}

/**
 * Drop every runtime cache for an agent. Called when its configuration is
 * saved so the next call/turn picks up the new voice, welcome, flow, etc.
 * immediately instead of after the TTL.
 */
export function invalidateAgentRuntimeCaches(workspaceId, agentId) {
  agentCache.delete(`${workspaceId}:${agentId}`);
  kbCache.delete(`${workspaceId}:${agentId}`);
  welcomeCache.delete(agentId);
}

// ─── Persona ──────────────────────────────────────────────────────────────────

// Agent records are usually named after the campaign ("Cold Calling Leads"),
// which sounds absurd spoken aloud. Each agent gets a stable human first name
// derived from its id, gender-matched to its configured voice.
const FEMALE_NAMES = ['Priya', 'Ananya', 'Riya', 'Neha', 'Kavya', 'Aisha', 'Meera', 'Sana'];
const MALE_NAMES = ['Arjun', 'Rohan', 'Aditya', 'Karan', 'Vikram', 'Rahul', 'Dev', 'Nikhil'];

export function getPersonaName(agent) {
  const voice = (agent.voice || '').toLowerCase();
  const list = /female|\bf\b/.test(voice) ? FEMALE_NAMES
    : /\bmale\b|\bm\b/.test(voice) ? MALE_NAMES
    : FEMALE_NAMES;
  let hash = 0;
  for (const ch of String(agent.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
}

// ─── Prompt construction ──────────────────────────────────────────────────────

// "Hindi" selected in the UI means the everyday spoken register — pure shuddh
// Hindi ("संभावित व्यावसायिक अवसरों पर चर्चा") sounds stiff and bureaucratic on
// a live call. Real callers code-mix: simple Hindi with common English words.
const HINGLISH_NOTE =
  ' Register: use everyday conversational Hindi (Hinglish) the way people actually talk on calls in India — simple spoken Hindi naturally mixed with common English words, writing those English words in Devanagari (e.g. "बिज़नेस", "सर्विस", "कॉल", "प्राइस", "बुकिंग"). NEVER use shuddh/formal Hindi vocabulary when a simpler or English word is what a real person would say — e.g. say "बिज़नेस के मौके" not "व्यावसायिक अवसर", "बात करना" not "चर्चा करना".';

const languageRegisterNote = (lang) => (/hindi/i.test(lang || '') ? HINGLISH_NOTE : '');

/**
 * Load the grounding text for an agent: agent-linked KB files plus
 * workspace-wide files (same sourcing rule as kbFile.controller.agentKbText).
 */
export async function getAgentKbText(workspaceId, agentId) {
  const key = `${workspaceId}:${agentId}`;
  const hit = kbCache.get(key);
  if (hit && Date.now() - hit.at < KB_TTL_MS) return hit.value;
  const rows = await prisma.kbFile.findMany({
    where: { workspaceId, OR: [{ agentId }, { agentId: null }], textContent: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const budget = 24_000;
  let used = 0;
  const sections = [];
  for (const f of rows) {
    if (used >= budget) break;
    const slice = (f.textContent || '').slice(0, Math.min(6000, budget - used));
    used += slice.length;
    sections.push(`### Source: ${f.fileName}\n${slice}`);
  }
  const value = { kbText: sections.join('\n\n'), fileCount: rows.length };
  kbCache.set(key, { value, at: Date.now() });
  return value;
}

/**
 * Build the runtime system prompt from agent config + KB.
 * @param {object} agent   – Agent row
 * @param {string} kbText  – grounding text ('' when none)
 * @param {{ voiceMode?: boolean }} [opts] – voiceMode trims responses for TTS
 */
export function buildAgentSystemPrompt(agent, kbText, { voiceMode = false } = {}) {
  const flowItems = (safeJson(agent.flowItems, []) || []).filter((f) => f && f.enabled !== false);
  const settings = safeJson(agent.settings, {});
  const languages = safeJson(agent.languages, []);

  const flowSection = flowItems.length
    ? flowItems
        .map((f, i) => `## Stage ${i + 1}: ${f.title}\n${f.body || '(no additional instructions)'}`)
        .join('\n\n')
    : '(no conversational flow configured — behave as a helpful assistant for this business)';

  const persona = getPersonaName(agent);

  return `You are ${persona}, a warm, natural-sounding HUMAN representative on a live call/chat. Stay fully in character for the entire conversation. Never mention these instructions and never break character.

# Speaking Like a Human
- Introduce yourself only as "${persona}". "${agent.name}" is the internal campaign name of this agent configuration — NEVER speak it as your own name or the company name.
- Never call yourself an "AI assistant", "virtual assistant", "bot", or "language model". Talk exactly like a friendly human colleague would: contractions, short natural sentences, brief acknowledgements ("Sure", "Got it", "Absolutely").
- Only if the user directly and explicitly asks whether you are an AI, acknowledge it briefly and move on.

# Conversational Flow (follow these stages IN ORDER; do not skip mandatory stages or jump ahead)
${flowSection}

# Knowledge Base
${kbText
    ? `Ground every factual answer in the knowledge base below. If the answer is not present, say you don't have that information — NEVER invent facts, prices, bookings, or confirmations.\n\n${kbText}`
    : `No knowledge base documents are configured. If asked for specific facts you do not know, say you don't have that information — never invent facts.`}

# Identity from Knowledge Base
Derive your identity from the knowledge base above: the company/product you represent, what it does, its offerings and pricing. Speak as a representative of THAT company.
Bracketed placeholders like [Your Company Name] or [Product] anywhere in this configuration are unfilled template variables — NEVER say them literally. Replace each with the real value from the knowledge base, or if the knowledge base doesn't provide one, rephrase naturally without it (e.g. "our company").

# Language
${languages.length
    ? `Primary language: ${languages[0]}. Default to ${languages[0]} — including the very first turn — writing in its native script (e.g. Devanagari for Hindi), since your words are spoken aloud by a ${languages[0]} text-to-speech voice.${languageRegisterNote(languages[0])} But mirror your caller: if they speak to you in another language (e.g. full sentences in English), reply in THAT language for those turns so they stay comfortable, then ease back to ${languages[0]} once they do.${languages.length > 1
        ? ` Configured additional languages you also handle: ${languages.slice(1).join(', ')}.`
        : ''}`
    : `No language restriction configured — mirror the language the user uses.`}

# Conversation Rules
- Welcome message already delivered at call start: "${agent.welcomeMessage}". Do not repeat it.
- Track everything the user has told you (name, contact details, preferences) and never re-ask for information already collected.
- Ask for at most one piece of information per turn.
- If the user asks for a human, or the request is outside your configured scope, offer to transfer/escalate.
- If the caller signals they're finished ("thank you", "thanks, bye", "that's all", "no, that's it"), stop asking questions — warmly acknowledge and wrap up${settings.endCallMessage ? `, closing with: "${settings.endCallMessage}"` : ''}. Never keep interrogating after a clear goodbye.
${settings.fillerWords ? `- Sound human: now and then open a reply with a short natural filler ("umm", "hmm", "let me see", "right") — sparingly, at most once every few turns, and never in the same breath as a price, number, or confirmation.` : ''}
${(settings.transferNumber || settings.transferCondition)
    ? `- Escalation/transfer: ${settings.transferCondition ? `When ${String(settings.transferCondition).trim()}, ` : 'If the caller asks for a human or needs something beyond your scope, '}let them know warmly that you'll connect them to a team member and are transferring them now. Never claim the transfer already went through or invent what the other person says.`
    : ''}
${voiceMode
    ? `- This is a live VOICE call: reply in 1-2 short natural spoken sentences (never more). Answer ONLY what was asked — give one fact/price at a time and offer to share more instead of listing everything. Absolutely no markdown, no bullet points, no emojis, no stage directions — only words to be spoken aloud.`
    : `- Keep replies to 2-4 short sentences — answer what was asked and ask at most one follow-up. No markdown headings or bullet-point walls; write like a person chatting.`}`;
}

// ─── LLM resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the LLM provider + model for an agent. The factory silently falls
 * back to another provider when the requested one has no API key — but the
 * *model* name must switch with it, or the fallback provider rejects it
 * (e.g. Gemini refusing "gpt-4.1-mini").
 */
export function resolveLlmForAgent(agent, { lowLatency = false } = {}) {
  const fromAgent = mapAgentModel(agent.aiModel);
  let provider = fromAgent.provider || process.env.DEFAULT_LLM_PROVIDER || 'gemini';
  let model = fromAgent.model || process.env.DEFAULT_LLM_MODEL || 'gemini-2.5-flash';

  const hasKey = (p) =>
    p === 'openai' ? Boolean(process.env.OPENAI_API_KEY)
    : p === 'gemini' ? Boolean(process.env.GEMINI_API_KEY)
    : p === 'azure' ? Boolean(process.env.AZURE_OPENAI_API_KEY)
    : true;
  if (!hasKey(provider)) {
    if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
      model = process.env.DEFAULT_LLM_MODEL || 'gemini-2.5-flash';
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
      model = 'gpt-4o-mini';
    }
  }

  // Live voice turns prioritize time-to-first-token. Flash Lite uses the same
  // Gemini API contract and grounding prompt with substantially lower latency.
  if (lowLatency && provider === 'gemini') model = 'gemini-3.1-flash-lite';

  return { llm: getLLMProviderWithFallback(provider), provider, model };
}

// ─── Welcome message rendering ────────────────────────────────────────────────

// Rendered welcomes are cached per agent and invalidated when the agent config
// or KB content changes, so the extra LLM call happens once, not per call.
const welcomeCache = new Map(); // agentId -> { key, welcome }

/** Deterministic placeholder fill for when no KB (or no LLM) is available. */
const stripPlaceholders = (text) =>
  text
    .replace(/\[([^\]]{1,60})\]/g, (_m, p) =>
      /company|business|brand|organi[sz]ation/i.test(p) ? 'our company'
      : /product|service/i.test(p) ? 'our services'
      : /agent|assistant|your name/i.test(p) ? 'your assistant'
      : '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();

/**
 * Return the agent's welcome message with template placeholders like
 * "[Your Company Name]" resolved from the knowledge base. This is what the
 * chat seeds and the web call speaks — the raw stored template is never
 * shown or spoken literally.
 */
export async function getRenderedWelcome(workspaceId, agentId) {
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }
  const raw = agent.welcomeMessage || '';
  const persona = getPersonaName(agent);
  const hasPlaceholders = /\[[^\]]+\]/.test(raw);
  // "Hello, I am Cold Calling Leads, your AI assistant…" — greetings that speak
  // the internal campaign name or call themselves an AI must be humanized.
  const soundsRobotic =
    (agent.name && raw.toLowerCase().includes(agent.name.toLowerCase())) ||
    /\bAI\b|artificial intelligence|virtual assistant|\bbot\b/i.test(raw);
  // The agent's configured language is authoritative for the whole call — a
  // welcome stored in English must be spoken in (e.g.) Hindi when Hindi is
  // the selected language, so it needs an LLM pass even if it isn't robotic.
  const languages = safeJson(agent.languages, []);
  const primaryLanguage = typeof languages[0] === 'string' ? languages[0] : '';
  const needsTranslation = Boolean(primaryLanguage) && !/^english/i.test(primaryLanguage);
  // INBOUND agents greet callers ("Thank you for calling…"); OUTBOUND agents
  // open the call themselves — the rewrite must never flip that style.
  const callDirection = safeJson(agent.settings, {}).callDirection;
  if (!hasPlaceholders && !soundsRobotic && !needsTranslation) {
    return { welcome: raw, rendered: false };
  }

  const { kbText } = await getAgentKbText(workspaceId, agentId).catch(() => ({ kbText: '' }));

  // Without a knowledge base there is nothing to ground a rewrite in — an LLM
  // pass just hallucinates facts. Only translation still needs the LLM.
  if (!kbText && !needsTranslation) return { welcome: stripPlaceholders(raw), rendered: true };

  // Content-based key (NOT updatedAt-based: persisting the result below
  // touches the row, which would otherwise invalidate its own cache entry).
  let hash = 0;
  for (const ch of `${raw}|${primaryLanguage}|${callDirection || ''}|${languageRegisterNote(primaryLanguage)}|${kbText.length}|${kbText.slice(0, 200)}`) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const cacheKey = String(hash);

  const cached = welcomeCache.get(agentId);
  if (cached && cached.key === cacheKey) return { welcome: cached.welcome, rendered: true };

  // Persisted in agent settings? Survives server restarts — the LLM rewrite
  // (~2s) then never blocks opening the chat/call again.
  const persisted = safeJson(agent.settings, {}).renderedWelcomeCache;
  if (persisted?.key === cacheKey && persisted.welcome) {
    welcomeCache.set(agentId, { key: cacheKey, welcome: persisted.welcome });
    return { welcome: persisted.welcome, rendered: true };
  }

  let welcome;
  try {
    const { llm, model } = resolveLlmForAgent(agent);
    const out = await llm.generateResponse(
      `Original greeting:\n"${raw}"${kbText ? `\n\nCompany knowledge base:\n${kbText.slice(0, 8000)}` : ''}`,
      { model, temperature: 0.1 },
      {
        systemPrompt:
          `Rewrite this call-opening greeting so it sounds like a real human caller named ${persona}${kbText ? ' who works for the company described in the knowledge base' : ''}. Rules: introduce yourself only as ${persona}${kbText ? " from the company's real name found in the knowledge base" : ''}; never say "${agent.name}" (internal campaign label), never say "AI", "assistant", or "bot"; replace any bracketed placeholder with the real value from the knowledge base, or drop it naturally if unknown; keep the greeting's original intent and warmth; 1-2 short spoken sentences.${callDirection === 'OUTBOUND'
            ? ' This is an OUTBOUND call the agent is placing TO the customer — introduce yourself and the reason for calling; NEVER thank the customer for calling.'
            : callDirection === 'INBOUND'
              ? ' This is an INBOUND call the customer placed to the company — thanking them for calling is appropriate.'
              : ''}${needsTranslation ? ` Write the greeting ENTIRELY in ${primaryLanguage}, in its native script (e.g. Devanagari for Hindi) — it is spoken aloud by a ${primaryLanguage} text-to-speech voice.${languageRegisterNote(primaryLanguage)}` : ''} Output ONLY the final greeting text, no quotes, no explanations.`,
        // Generous budget: Gemini 2.5's internal "thinking" tokens count
        // against maxTokens, so a tight cap truncates the visible output.
        maxTokens: 1000,
        // No reasoning pass for a one-line rewrite — halves the latency.
        thinkingBudget: 0,
      }
    );
    welcome = (typeof out === 'object' ? out.message : out || '').trim().replace(/^["']|["']$/g, '');
    // Guard against a bad LLM response: empty, truncated (no terminal
    // punctuation / too short), brackets kept, or campaign name spoken.
    // "।" is the Devanagari sentence terminator (danda) — without it every
    // valid Hindi greeting would be rejected as truncated.
    if (!welcome || welcome.length < 20 || !/[.!?।]$/.test(welcome) ||
        /\[[^\]]+\]/.test(welcome) ||
        (agent.name && welcome.toLowerCase().includes(agent.name.toLowerCase()))) {
      welcome = stripPlaceholders(raw);
    }
  } catch {
    welcome = stripPlaceholders(raw);
  }

  welcomeCache.set(agentId, { key: cacheKey, welcome });

  // Persist fire-and-forget so restarts don't pay the LLM rewrite again.
  // Re-read the row first: the 15s agent cache could hold stale settings and
  // clobber an edit the user just saved.
  (async () => {
    const fresh = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!fresh) return;
    const settings = safeJson(fresh.settings, {});
    settings.renderedWelcomeCache = { key: cacheKey, welcome };
    await prisma.agent.update({
      where: { id: agentId },
      data: { settings: JSON.stringify(settings) },
    });
    agentCache.delete(`${workspaceId}:${agentId}`);
  })().catch(() => {});

  return { welcome, rendered: true };
}

// ─── Conversation ─────────────────────────────────────────────────────────────

/**
 * Generate the agent's next reply given full conversation history.
 * @param {string} workspaceId
 * @param {string} agentId
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages – full
 *   history, last entry must be the newest user message
 * @param {{ voiceMode?: boolean }} [opts]
 * @returns {Promise<{ reply: string, provider: string, model: string }>}
 */
// Shared setup for converse()/converseStream(): loads the agent, builds the
// grounded system prompt (with prior turns embedded), and resolves the LLM.
// Returns everything both the buffered and streaming paths need so the two
// stay byte-for-byte identical in how they prompt the model.
async function _prepareConverse(workspaceId, agentId, messages, { voiceMode = false } = {}) {
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }

  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim() &&
      (m.role === 'user' || m.role === 'assistant'))
    .slice(voiceMode ? -12 : -30); // keep live-call prompts compact
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') {
    const err = new Error('messages must end with a user message');
    err.statusCode = 400;
    throw err;
  }

  const { kbText } = await getAgentKbText(workspaceId, agentId).catch(() => ({ kbText: '' }));
  const promptKb = voiceMode ? kbText.slice(0, 12_000) : kbText;
  let systemPrompt = buildAgentSystemPrompt(agent, promptKb, { voiceMode });

  // The LLM services take (message, config, { systemPrompt }) — a single-turn
  // API — so prior turns are embedded as a transcript in the system prompt.
  const prior = history.slice(0, -1);
  if (prior.length) {
    const transcript = prior
      .map((m) => `${m.role === 'user' ? 'User' : agent.name}: ${m.content}`)
      .join('\n');
    systemPrompt += `\n\n# Conversation so far (welcome message included; continue from here)\n${transcript}`;
  }

  const { llm, provider, model } = resolveLlmForAgent(agent, { lowLatency: voiceMode });
  // Brevity in voice mode is enforced by the prompt, not the token cap —
  // Gemini 2.5's internal "thinking" tokens count against maxTokens, so a
  // tight cap truncates replies mid-sentence. Thinking is disabled for ALL
  // conversation turns (chat AND voice): a persona chat grounded in a KB
  // doesn't need a reasoning pass, and it costs ~2-3s per reply.
  const options = { systemPrompt, maxTokens: voiceMode ? 320 : 2000, thinkingBudget: 0 };
  const config = { model, temperature: DEFAULT_TEMPERATURE };
  return { agent, last, llm, provider, model, config, options, voiceMode };
}

// Markdown → speakable text. The reply is sent to TTS, so strip formatting.
const stripForVoice = (s) => s.replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim();

export async function converse(workspaceId, agentId, messages, { voiceMode = false } = {}) {
  const { agent, last, llm, provider, model, config, options } =
    await _prepareConverse(workspaceId, agentId, messages, { voiceMode });

  const raw = await llm.generateResponse(last.content, config, options);
  let reply = (typeof raw === 'object' ? raw.message : raw) || '';
  if (voiceMode) reply = stripForVoice(reply);

  return { reply, provider, model, agent };
}

/**
 * Streaming variant of converse(): yields the reply as text deltas as the LLM
 * produces them so a caller can start TTS on the first sentence before the
 * full reply is generated (the B1 sentence-chunked pipeline). Providers that
 * don't implement generateResponseStream fall back to a single delta, so every
 * provider keeps working — just without token-level streaming.
 *
 * The generator's RETURN value is `{ provider, model }` (grab it from the
 * final `iterator.next()` result) for latency logging.
 * @returns {AsyncGenerator<string, { provider: string, model: string }>}
 */
export async function* converseStream(workspaceId, agentId, messages, { voiceMode = false } = {}) {
  const { last, llm, provider, model, config, options } =
    await _prepareConverse(workspaceId, agentId, messages, { voiceMode });

  if (typeof llm.generateResponseStream === 'function') {
    yield* llm.generateResponseStream(last.content, config, options);
  } else {
    // Non-streaming provider: one buffered call, emitted as a single chunk.
    const raw = await llm.generateResponse(last.content, config, options);
    const reply = (typeof raw === 'object' ? raw.message : raw) || '';
    if (reply) yield reply;
  }
  return { provider, model };
}

/**
 * Splits a token stream into speakable sentence chunks so TTS can begin on
 * sentence 1 while the LLM is still writing sentence 2. Feed raw LLM deltas to
 * push(); it returns any newly-complete sentences (>= minChars, so tiny
 * fragments aren't synthesized alone). Call flush() at end-of-stream for the
 * trailing partial sentence.
 *
 * A sentence boundary is end punctuation (. ! ? …) — optionally followed by a
 * closing quote/bracket — that is followed by whitespace. Requiring trailing
 * whitespace (not end-of-buffer) during push() avoids cutting on "3.5" or an
 * abbreviation that just happens to sit at the current buffer edge.
 */
export function createSentenceChunker({ minChars = 30 } = {}) {
  let buf = '';
  const boundary = /([.!?…])(["')\]]?)(\s)/g;
  const emitReady = () => {
    const out = [];
    let lastCut = 0;
    let m;
    boundary.lastIndex = 0;
    while ((m = boundary.exec(buf)) !== null) {
      const end = m.index + m[0].length;
      const candidate = buf.slice(lastCut, end).trim();
      if (candidate.length >= minChars) {
        out.push(candidate);
        lastCut = end;
      }
    }
    if (lastCut > 0) buf = buf.slice(lastCut);
    return out;
  };
  return {
    push(delta) { buf += delta; return emitReady(); },
    flush() { const rest = buf.trim(); buf = ''; return rest ? [rest] : []; },
  };
}

// ─── Voice turn (STT → converse → TTS) ────────────────────────────────────────

// TTS audio cache: the welcome message is spoken at the start of every call
// with identical text — with a Sarvam voice that synthesis alone costs 4-6s.
// Cached per (voice, text) so repeat calls (and the page-load prefetch) make
// call start effectively instant. Small LRU, 10 min TTL.
const ttsCache = new Map(); // `${voiceId}|${textHash}` -> { audioBase64, contentType, at }
const TTS_CACHE_TTL_MS = 10 * 60 * 1000;
const TTS_CACHE_MAX = 30;

const hashText = (s) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h);
};

/**
 * Text-to-speech for an agent using its configured (or fallback) voice.
 * @returns {Promise<{ audioBase64: string, contentType: string, voiceUsed: string }>}
 */
export async function speakAsAgent(workspaceId, agentId, text) {
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }
  const voice = await resolveAgentVoice(agent.voice);
  if (!voice) {
    const err = new Error('No TTS voice available — configure a voice provider API key and sync voices');
    err.statusCode = 503;
    throw err;
  }
  const voiceUsed = `${voice.provider?.name} - ${voice.name}`;

  const cacheKey = `${voice.id}|${hashText(text)}`;
  const hit = ttsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTS_CACHE_TTL_MS) {
    return { audioBase64: hit.audioBase64, contentType: hit.contentType, voiceUsed };
  }

  // Synthesize through the SAME streaming path the reply turns use. Sarvam's
  // batch and streaming endpoints do not voice the same speaker id
  // identically (they also fall back differently on unrecognized speakers),
  // so using the batch endpoint here made the welcome audibly mismatch every
  // reply in the call. Buffering the stream keeps the base64 contract.
  const settings = safeJson(agent.settings, {});
  const { stream, contentType } = await streamSynthesizeVoice(voice, text, {
    fast: true,
    pace: Number(settings.speakingRate) || 1.05,
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const audioBase64 = buffer.toString('base64');

  ttsCache.set(cacheKey, { audioBase64, contentType, at: Date.now() });
  if (ttsCache.size > TTS_CACHE_MAX) {
    // Evict oldest entry
    const oldest = [...ttsCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) ttsCache.delete(oldest[0]);
  }

  return { audioBase64, contentType, voiceUsed };
}

/** Stream speech to the browser without waiting for the full audio file. */
export async function streamSpeechAsAgent(workspaceId, agentId, text) {
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }
  const voice = await resolveAgentVoice(agent.voice);
  if (!voice) {
    const err = new Error('No TTS voice available - configure a voice provider API key and sync voices');
    err.statusCode = 503;
    throw err;
  }
  const settings = safeJson(agent.settings, {});
  const out = await streamSynthesizeVoice(voice, text, {
    fast: true,
    pace: Number(settings.speakingRate) || 1.05,
  });
  return { ...out, voiceUsed: `${voice.provider?.name} - ${voice.name}` };
}

/**
 * One full web-call turn: audio in → transcript → grounded reply → audio out.
 * @param {string} workspaceId
 * @param {string} agentId
 * @param {Buffer} audioBuffer – user's recorded speech segment
 * @param {string} mimeType
 * @param {Array} history – prior conversation messages
 */
export async function voiceTurn(workspaceId, agentId, audioBuffer, mimeType, history = [], options = {}) {
  const turnStartedAt = performance.now();
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }

  const settings = safeJson(agent.settings, {});
  const preferredProvider = settings.sttProvider || agent.transcription;
  const languageCode = settings.sttLanguage && settings.sttLanguage !== 'Multi'
    ? settings.sttLanguage
    : undefined;

  // Warm remote DB-backed context while the external STT request is running.
  // converse()/speakAsAgent() then hit their short-lived caches.
  const contextWarmup = Promise.allSettled([
    getAgentKbText(workspaceId, agentId),
    resolveAgentVoice(agent.voice),
  ]);

  const sttStartedAt = performance.now();
  const { text: userText, provider: sttProvider } = await transcribeAudio(audioBuffer, mimeType, {
    preferredProvider,
    languageCode,
  });
  const sttMs = Math.round(performance.now() - sttStartedAt);
  await contextWarmup;

  // Nothing intelligible (silence / background noise) — let the client resume
  // listening without burning an LLM/TTS call.
  if (!userText || userText.length < 2) {
    return {
      userText: '', reply: null, audioBase64: null, contentType: null,
      timings: { sttMs, llmMs: 0, ttsMs: 0, totalMs: Math.round(performance.now() - turnStartedAt) },
    };
  }

  const messages = [...history, { role: 'user', content: userText }];
  const llmStartedAt = performance.now();
  const { reply, provider: llmProvider, model } = await converse(
    workspaceId,
    agentId,
    messages,
    { voiceMode: true }
  );
  const llmMs = Math.round(performance.now() - llmStartedAt);

  let audioBase64 = null;
  let contentType = null;
  let ttsMs = 0;
  if (options.synthesize !== false) {
    const ttsStartedAt = performance.now();
    try {
      const speech = await speakAsAgent(workspaceId, agentId, reply);
      audioBase64 = speech.audioBase64;
      contentType = speech.contentType;
    } catch (err) {
      logger.warn(`Web call TTS failed (returning text-only turn): ${err.message}`);
    }
    ttsMs = Math.round(performance.now() - ttsStartedAt);
  }

  const totalMs = Math.round(performance.now() - turnStartedAt);
  const latency = { agentId, callId: options.callId, sttProvider, llmProvider, model, sttMs, llmMs, ttsMs, totalMs };
  logger.info(latency, 'Web call turn latency');
  logTurnLatency(latency); // persist to logs/latency.log for offline analysis

  return {
    userText,
    reply,
    audioBase64,
    contentType,
    timings: { sttMs, llmMs, ttsMs, totalMs },
  };
}

/**
 * B1 — streaming web-call turn: audio in → transcript → STREAMED reply, with
 * TTS fired per sentence so the caller hears sentence 1 while the LLM is still
 * writing sentence 2. This is the overlap that makes the modular ("combined
 * sources") agent feel as fast as a bundled speech-to-speech engine.
 *
 * Instead of returning one blob, it emits events via `onEvent`:
 *   { type: 'transcript', userText }
 *   { type: 'sentence', seq, text, audioBase64, contentType }   (one per sentence)
 *   { type: 'done', reply, timings }
 * The transport (NDJSON endpoint now, WS in B2) just serializes these.
 *
 * @param {string} workspaceId
 * @param {string} agentId
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @param {Array} history
 * @param {{ onEvent?: (e: object) => void, shouldAbort?: () => boolean }} [opts]
 *   shouldAbort — polled before synthesizing/emitting each sentence so a caller
 *   (e.g. the B2 WebSocket handler on barge-in) can stop the reply mid-flight.
 */
export async function voiceTurnStream(workspaceId, agentId, audioBuffer, mimeType, history = [], { onEvent, shouldAbort, userText: providedText } = {}) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const aborted = typeof shouldAbort === 'function' ? shouldAbort : () => false;
  const turnStartedAt = performance.now();

  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }
  const settings = safeJson(agent.settings, {});
  const preferredProvider = settings.sttProvider || agent.transcription;
  const languageCode = settings.sttLanguage && settings.sttLanguage !== 'Multi'
    ? settings.sttLanguage
    : undefined;
  const speakingRate = Number(settings.speakingRate) || 1.05;

  // Resolve the voice while STT runs so per-sentence TTS starts with no lookup.
  const voicePromise = resolveAgentVoice(agent.voice).catch(() => null);

  // B3: if the caller (WS handler) already has a streaming-STT transcript, use
  // it and skip the batch STT round-trip entirely. Otherwise transcribe the
  // buffered audio the usual way.
  const sttStartedAt = performance.now();
  let userText;
  let sttProvider;
  if (providedText && providedText.trim()) {
    userText = providedText.trim();
    sttProvider = 'stream';
  } else {
    ({ text: userText, provider: sttProvider } = await transcribeAudio(audioBuffer, mimeType, {
      preferredProvider,
      languageCode,
    }));
  }
  const sttMs = Math.round(performance.now() - sttStartedAt);

  // Silence / noise only — resume listening without an LLM/TTS call.
  if (!userText || userText.length < 2) {
    emit({ type: 'transcript', userText: '' });
    emit({ type: 'done', reply: null, timings: { sttMs, llmMs: 0, ttsMs: 0, ttfaMs: 0, totalMs: Math.round(performance.now() - turnStartedAt) } });
    return;
  }
  emit({ type: 'transcript', userText });

  const voice = await voicePromise;
  const messages = [...history, { role: 'user', content: userText }];

  // Reply generation.
  //
  // NOTE: B1 synthesized the reply sentence-by-sentence to overlap TTS with the
  // LLM. In practice that (a) gave NO measured speed-up — first audio still
  // landed at end-of-turn (ttfaMs ≈ totalMs in logs/latency.log) — and (b) made
  // the VOICE DRIFT: Sarvam's streaming TTS is stochastic (temperature 0.6), so
  // each separately-synthesized sentence sounded like a slightly different
  // speaker/pace, and none matched the one-shot welcome. So the reply is now a
  // SINGLE LLM call + a SINGLE TTS call — identical to how the welcome is made,
  // which keeps the voice consistent across the whole call.
  //
  // The non-streaming converse() path is used deliberately: it is the proven-
  // fast one (~1.5s in the logs), avoiding the streaming-LLM path whose timing
  // we could not yet trust. llmMs/ttsMs below are now measured SEPARATELY so the
  // next call pinpoints whether the remaining latency is the LLM or the TTS.
  // converseStream()/createSentenceChunker remain exported for B4, where a
  // genuinely streaming-capable TTS can overlap without the drift.
  const llmStartedAt = performance.now();
  const { reply: rawReply, provider, model } = await converse(workspaceId, agentId, messages, { voiceMode: true });
  const llmMs = Math.round(performance.now() - llmStartedAt);
  const reply = stripForVoice(rawReply || '');

  // B4 — stream the reply's audio to the caller as each TTS byte arrives,
  // instead of buffering the whole reply first. `firstAudioAt` is now the first
  // BYTE (not the whole file), so ttfaMs finally reflects true time-to-first-
  // audio and the caller starts hearing the reply while it's still synthesizing.
  // Still ONE TTS call for the whole reply → the voice stays consistent (the
  // per-sentence drift fix stands).
  //   emits: { audio-start, contentType } → { audio-chunk, data:<base64> }* → { audio-end, text }
  let firstAudioAt = null;
  let ttsMs = 0;
  if (reply && !aborted()) {
    const ttsStartedAt = performance.now();
    if (!voice) {
      emit({ type: 'audio-start', contentType: null });
      emit({ type: 'audio-end', text: reply });
    } else {
      try {
        const { stream, contentType } = await streamSynthesizeVoice(voice, reply, { fast: true, pace: speakingRate });
        emit({ type: 'audio-start', contentType });
        for await (const c of stream) {
          if (aborted()) break; // barge-in: stop shovelling audio nobody's hearing
          if (firstAudioAt == null) firstAudioAt = performance.now();
          const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
          if (buf.length) emit({ type: 'audio-chunk', data: buf.toString('base64') });
        }
        emit({ type: 'audio-end', text: reply });
      } catch (err) {
        logger.warn(`voiceTurnStream TTS failed: ${err.message}`);
        emit({ type: 'audio-end', text: reply });
      }
    }
    ttsMs = Math.round(performance.now() - ttsStartedAt);
  }

  const totalMs = Math.round(performance.now() - turnStartedAt);
  const ttfaMs = firstAudioAt != null ? Math.round(firstAudioAt - turnStartedAt) : totalMs;

  const latency = { agentId, sttProvider, llmProvider: provider, model, sttMs, llmMs, ttsMs, ttfaMs, totalMs, streamed: true };
  logger.info(latency, 'Web call streaming turn latency');
  logTurnLatency(latency);

  emit({ type: 'done', reply, timings: { sttMs, llmMs, ttsMs, ttfaMs, totalMs } });
  return { userText, reply, timings: { sttMs, llmMs, ttsMs, ttfaMs, totalMs } };
}
