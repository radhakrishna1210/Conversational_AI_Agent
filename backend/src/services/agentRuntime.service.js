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
import { createTokenTtsStream, supportsTokenStreaming, synthesisProviderName } from './voice/ttsStreamFactory.js';
import { groqService } from './groq.service.js';
import { transcribeAudio } from './stt.service.js';
import { isLikelySttHallucination } from './stt/speechGate.js';

const safeJson = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

// ─── Short-TTL caches ─────────────────────────────────────────────────────────
// A web call issues a turn every few seconds; re-reading the agent row and KB
// from the remote DB on every stage added ~1-2s per turn. TTLs must outlast the
// GAP BETWEEN TURNS (user listens + thinks ≈ 15-60s), not just one turn — the
// old 15s/30s TTLs expired between turns, so nearly every turn paid the remote
// DB round-trip again (the "unaccounted" 0.5-2s gaps in logs/latency.log).
// Config edits are safe at any TTL: saving an agent calls
// invalidateAgentRuntimeCaches(), which drops these entries immediately.
const AGENT_TTL_MS = 5 * 60_000;
const KB_TTL_MS = 5 * 60_000;
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

/**
 * Drop the grounding cache after a knowledge-base change (upload / delete).
 *
 * Saving an agent's config invalidated its caches, but adding a KB file did
 * not — so an agent that had been used in the last 5 minutes kept answering
 * from the OLD knowledge base, and a file deleted for being wrong stayed in
 * the prompt just as long. Uploading a document and immediately testing the
 * agent is the normal way to work, which is exactly when the stale window bit.
 *
 * A file with no agentId is workspace-wide grounding for EVERY agent, so that
 * case clears the whole workspace. The welcome cache goes too: the greeting is
 * rewritten from the knowledge base (resolveWelcomeMessage), so it is derived
 * from the same text.
 */
export function invalidateKbCaches(workspaceId, agentId = null) {
  if (agentId) {
    kbCache.delete(`${workspaceId}:${agentId}`);
    welcomeCache.delete(agentId);
    return;
  }
  const prefix = `${workspaceId}:`;
  for (const key of kbCache.keys()) {
    if (key.startsWith(prefix)) kbCache.delete(key);
  }
  // Keyed by agentId alone, so a workspace-wide change cannot target entries
  // precisely. It is a small cache rebuilt on demand — clearing it is cheap.
  welcomeCache.clear();
}

// ─── Persona ──────────────────────────────────────────────────────────────────

// Agent records are usually named after the campaign ("Cold Calling Leads"),
// which sounds absurd spoken aloud. Each agent gets a stable human first name
// derived from its id, gender-matched to its configured voice.
const FEMALE_NAMES = ['Priya', 'Ananya', 'Riya', 'Neha', 'Kavya', 'Aisha', 'Meera', 'Sana'];
const MALE_NAMES = ['Arjun', 'Rohan', 'Aditya', 'Karan', 'Vikram', 'Rahul', 'Dev', 'Nikhil'];

// …but plenty of agents are named after the PERSON they portray ("Purva"), not
// a campaign. Inventing a different name for those is user-visible nonsense:
// the UI says Purva, the welcome message says Purva, and the agent introduces
// itself as someone else entirely. Words that describe a role or a campaign
// rather than a person disqualify the name.
const NON_PERSONA_WORDS = new Set([
  'agent', 'assistant', 'bot', 'ai', 'campaign', 'call', 'calls', 'calling', 'caller',
  'lead', 'leads', 'sales', 'support', 'service', 'demo', 'test', 'testing', 'trial',
  'receptionist', 'reception', 'outbound', 'inbound', 'followup', 'follow', 'reminder',
  'collection', 'collections', 'survey', 'booking', 'appointment', 'appointments',
  'clinic', 'hospital', 'medical', 'health', 'bank', 'loan', 'insurance', 'recruiter',
  'hr', 'copy', 'clone', 'new', 'default', 'untitled', 'my',
]);

/** Is one bare token a plausible human first name (not a role/campaign word)? */
function tokenIsHumanName(token) {
  const t = String(token ?? '').trim();
  if (!/^[A-Za-z][A-Za-z'’-]{1,19}$/.test(t)) return false; // one word, 2-20 letters
  if (NON_PERSONA_WORDS.has(t.toLowerCase())) return false;
  // A name needs a vowel. Without this, keyboard mash ("asdfbckjznc") passed and
  // the agent introduced itself as that.
  if (!/[aeiouyAEIOUY]/.test(t)) return false;
  return true;
}

/**
 * Is the agent's own name usable as the spoken persona? True for a single
 * human-looking first name ("Purva"), false for campaign labels
 * ("Cold Calling Leads", "City Medical Hospital Receptionist").
 */
export function agentNameIsPersona(agent) {
  return tokenIsHumanName(String(agent?.name ?? '').trim());
}

/**
 * Pull the spoken first name out of a DISPLAY name like
 * "Purva - Hospital Receptionist" → "Purva".
 *
 * Only splits on an explicit separator (dash / colon / pipe / comma), which is
 * the "<Name> - <Role>" shape the onboarding generator produces. A plain
 * multi-word label has NO separator and must not be split: taking the first
 * token of "Real Estate Lead Qualification" or "school admissions" would have
 * the agent introduce itself as "Real" or "School".
 */
export function personaNameFromLabel(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return null;
  const [head] = raw.split(/\s*[-–—:|,]\s*/);
  const token = String(head ?? '').trim();
  return tokenIsHumanName(token) ? token : null;
}

/**
 * The name the agent SPEAKS when introducing itself.
 *
 * Resolution order matters — this is what the caller actually hears:
 *  1. settings.personaName — the name the onboarding generator chose and stored.
 *     Authoritative: it is the same name written into the welcome message, so
 *     anything else here makes the agent contradict its own greeting.
 *  2. The agent's own name when it IS a bare human name ("Riley").
 *  3. The leading name of a "<Name> - <Role>" display label ("Purva - Hospital
 *     Receptionist" → "Purva").
 *  4. Only then a derived name, for genuine campaign labels ("Cold Calling
 *     Leads") that contain no human name at all.
 *
 * Steps 1 and 3 are the bug fix: the generator names agents "<Name> - <Role>",
 * which failed the single-word test, so EVERY such agent fell through to step 4
 * and introduced itself as a stranger — and because the old hash clustered
 * badly, usually the SAME stranger ("Sana") across unrelated accounts.
 */
export function getPersonaName(agent) {
  const settings = safeJson(agent?.settings, {});
  const stored = typeof settings?.personaName === 'string' ? settings.personaName.trim() : '';
  if (tokenIsHumanName(stored)) return stored;

  if (agentNameIsPersona(agent)) return String(agent.name).trim();

  const fromLabel = personaNameFromLabel(agent?.name);
  if (fromLabel) return fromLabel;

  const voice = (agent?.voice || '').toLowerCase();
  const list = /female|\bf\b/.test(voice) ? FEMALE_NAMES
    : /\bmale\b|\bm\b/.test(voice) ? MALE_NAMES
    : FEMALE_NAMES;
  // FNV-1a + a murmur3 finalizer. The old `h * 31 + c` over cuids (which share a
  // timestamp prefix and a narrow alphabet) barely mixed the LOW bits — and
  // `% 8` reads only those — so unrelated agents kept landing on the same few
  // names, which is the "every account says Sana" half of the report. The
  // avalanche step is what actually spreads them; FNV alone still clustered.
  let hash = 0x811c9dc5;
  for (const ch of String(agent?.id ?? '')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Every step re-coerces with >>> 0: `^=` yields a SIGNED 32-bit int, and a
  // negative modulo would index off the end of the array and return undefined.
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return list[hash % list.length];
}

// ─── Prompt construction ──────────────────────────────────────────────────────

// "Hindi" selected in the UI means the everyday spoken register — pure shuddh
// Hindi ("संभावित व्यावसायिक अवसरों पर चर्चा") sounds stiff and bureaucratic on
// a live call. Real callers code-mix: simple Hindi with common English words.
const HINGLISH_NOTE =
  ' Register: use everyday conversational Hindi (Hinglish) the way people actually talk on calls in India — simple spoken Hindi naturally mixed with common English words, writing those English words in Devanagari (e.g. "बिज़नेस", "सर्विस", "कॉल", "प्राइस", "बुकिंग"). NEVER use shuddh/formal Hindi vocabulary when a simpler or English word is what a real person would say — e.g. say "बिज़नेस के मौके" not "व्यावसायिक अवसर", "बात करना" not "चर्चा करना".';

const languageRegisterNote = (lang) => (/hindi/i.test(lang || '') ? HINGLISH_NOTE : '');

// How much knowledge base actually reaches the model.
//
// These were 6,000 chars per file / 24,000 total, which silently starved real
// agents: a 140 KB knowledge base contributed 6 KB — about 4% — so the agent
// answered "I don't have that information" about documented facts. The caps also
// held the prompt near ~2.8k tokens, and implicit caching does not engage below
// roughly 5-10k (measured, scratch/probe_cache_threshold.mjs), so the small
// budget was costing accuracy AND blocking the cache discount.
//
// Env-tunable because the trade-off is real: a bigger KB makes an UNCACHED turn
// slower to prefill. Cached turns (2 onward, and every turn of every later call)
// do not pay that. Lower these if first-turn latency matters more than recall.
// The proper fix for very large documents is retrieval, not a bigger paste.
const KB_PER_FILE_CHARS = Number(process.env.KB_PER_FILE_CHARS || 48_000);
const KB_TOTAL_CHARS = Number(process.env.KB_TOTAL_CHARS || 96_000);
const KB_VOICE_CHARS = Number(process.env.KB_VOICE_CHARS || 48_000);

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
  let used = 0;
  const sections = [];
  for (const f of rows) {
    if (used >= KB_TOTAL_CHARS) break;
    const slice = (f.textContent || '').slice(0, Math.min(KB_PER_FILE_CHARS, KB_TOTAL_CHARS - used));
    used += slice.length;
    sections.push(`### Source: ${f.fileName}\n${slice}`);
  }
  const value = { kbText: sections.join('\n\n'), fileCount: rows.length };
  kbCache.set(key, { value, at: Date.now() });
  return value;
}

// Header + acknowledgement used when the KB is delivered as a conversation turn
// instead of being inlined in the system prompt (see buildRuntimeMessages).
// These strings are part of the cached prefix — changing them invalidates every
// agent's cache once, so don't churn them.
export const KB_MESSAGE_HEADER = '# Knowledge Base';
export const KB_MESSAGE_ACK =
  'Understood. I have the knowledge base and will ground every factual answer in it.';

/**
 * Build the runtime system prompt from agent config + KB.
 * @param {object} agent   – Agent row
 * @param {string} kbText  – grounding text ('' when none)
 * @param {{ voiceMode?: boolean, kbInline?: boolean }} [opts]
 *   voiceMode trims responses for TTS.
 *   kbInline=false omits the KB BODY (keeping the grounding rules) because the
 *   caller is sending it as the first conversation turn instead. Bundled
 *   realtime engines must keep kbInline=true: they push one instruction blob at
 *   session open and have no conversation turns to attach the KB to.
 */
export function buildAgentSystemPrompt(agent, kbText, { voiceMode = false, kbInline = true } = {}) {
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
- Introduce yourself only as "${persona}".${agentNameIsPersona(agent) ? '' : ` "${agent.name}" is the internal campaign name of this agent configuration — NEVER speak it as your own name or the company name.`}
- Never call yourself an "AI assistant", "virtual assistant", "bot", or "language model". Talk exactly like a friendly human colleague would: contractions, short natural sentences, brief acknowledgements ("Sure", "Got it", "Absolutely").
- Only if the user directly and explicitly asks whether you are an AI, acknowledge it briefly and move on.

# Conversational Flow (follow these stages IN ORDER; do not skip mandatory stages or jump ahead)
${flowSection}

# Knowledge Base
${!kbText
    ? `No knowledge base documents are configured. If asked for specific facts you do not know, say you don't have that information — never invent facts.`
    : kbInline
      ? `Ground every factual answer in the knowledge base below. If the answer is not present, say you don't have that information — NEVER invent facts, prices, bookings, or confirmations.\n\n${kbText}`
      : `Your knowledge base was delivered as the FIRST message of this conversation, under the heading "${KB_MESSAGE_HEADER}". Treat it as reference material you already know — never mention that it was sent to you, and never read it out. Ground every factual answer in it. If the answer is not present, say you don't have that information — NEVER invent facts, prices, bookings, or confirmations.`}

# Identity from Knowledge Base
Derive your identity from the knowledge base: the company/product you represent, what it does, its offerings and pricing. Speak as a representative of THAT company.
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
    : p === 'groq' ? Boolean(process.env.GROQ_API_KEY)
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

  // Groq (ultra-low-latency LPU) — selected as the agent's AI Model. Its service
  // is OpenAI-compatible but separate from getLLMProviderWithFallback. Chosen
  // explicitly now (not an automatic override) so it shows in the model picker.
  if (provider === 'groq') {
    return { llm: groqService, provider: 'groq', model: process.env.GROQ_MODEL || model };
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

// An inbound-style "thank you for calling" opener — wrong for an OUTBOUND agent,
// which places the call itself. Kept in sync with the client-side warning in
// EditAgent.tsx (THANKS_FOR_CALLING_RE).
const THANKS_FOR_CALLING_RE = /\bthank(?:s|\s*you)?\b[^.!?]*\bfor\s+calling\b/i;

/** Remove an inbound-style "thank you for calling…" clause so a greeting no
 *  longer contradicts an OUTBOUND call the agent itself placed. Deterministic
 *  fallback for when there is no KB to ground a proper self-introduction. */
const stripInboundThanks = (text) =>
  text
    .replace(/\b(?:and\s+)?thank(?:s|\s*you)?\b[^.!?]*\bfor\s+calling\b[^.!?]*[.!?]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,.;:!?-]+/, '')
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
  // …but when the agent's name IS the persona ("Purva"), a greeting that says
  // "I'm Purva" is exactly right and must not be rewritten into someone else.
  const nameIsPersona = agentNameIsPersona(agent);
  const soundsRobotic =
    (agent.name && !nameIsPersona && raw.toLowerCase().includes(agent.name.toLowerCase())) ||
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
  // An OUTBOUND agent whose stored greeting thanks the caller "for calling" is
  // self-contradictory — the agent placed the call. Force a rewrite (or a
  // deterministic strip) so it never speaks "thank you for calling", even when
  // the greeting is otherwise clean (no placeholders / not robotic / English).
  const directionMismatch =
    callDirection === 'OUTBOUND' && THANKS_FOR_CALLING_RE.test(raw);
  if (!hasPlaceholders && !soundsRobotic && !needsTranslation && !directionMismatch) {
    return { welcome: raw, rendered: false };
  }

  const { kbText } = await getAgentKbText(workspaceId, agentId).catch(() => ({ kbText: '' }));

  // Without a knowledge base there is nothing to ground a rewrite in — an LLM
  // pass just hallucinates facts. Only translation still needs the LLM. An
  // OUTBOUND greeting that thanks for calling is still deterministically fixed.
  if (!kbText && !needsTranslation) {
    const base = directionMismatch ? stripInboundThanks(raw) : raw;
    return { welcome: stripPlaceholders(base), rendered: true };
  }

  // Content-based key (NOT updatedAt-based: persisting the result below
  // touches the row, which would otherwise invalidate its own cache entry).
  let hash = 0;
  // `persona` is part of the key: it decides the name the greeting speaks, so a
  // persona change (or a rename that turns the agent name INTO the persona)
  // must not keep serving a greeting that introduces someone else.
  for (const ch of `${raw}|${persona}|${primaryLanguage}|${callDirection || ''}|${languageRegisterNote(primaryLanguage)}|${kbText.length}|${kbText.slice(0, 200)}`) {
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
          `Rewrite this call-opening greeting so it sounds like a real human caller named ${persona}${kbText ? ' who works for the company described in the knowledge base' : ''}. Rules: introduce yourself only as ${persona}${kbText ? " from the company's real name found in the knowledge base" : ''}; ${nameIsPersona ? `you are called "${persona}" and MUST introduce yourself by that name — write it in the target script if the greeting is not in English (so the TTS voice pronounces it), but NEVER substitute a different name` : `never say "${agent.name}" (internal campaign label)`}, never say "AI", "assistant", or "bot"; replace any bracketed placeholder with the real value from the knowledge base, or drop it naturally if unknown; keep the greeting's original intent and warmth; 1-2 short spoken sentences.${callDirection === 'OUTBOUND'
            ? ` This is an OUTBOUND call the agent is placing TO the customer — the customer did NOT call in, so open by introducing yourself BY NAME and naming the company you are calling FROM${kbText ? `, using the company's real name from the knowledge base — phrase it as "Hi, this is ${persona} calling from <that company>, …"` : `; if the original greeting names a company, phrase it as "Hi, this is ${persona} calling from <that company>, …", otherwise just introduce yourself by name and do NOT invent a company`}, then briefly give the reason for the call. NEVER say "thank you for calling" or "thanks for calling", and do NOT open with the reason before naming who is calling and from where.`
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
        (agent.name && !nameIsPersona && welcome.toLowerCase().includes(agent.name.toLowerCase())) ||
        (directionMismatch && /\bfor\s+calling\b/i.test(welcome))) {
      welcome = directionMismatch ? stripInboundThanks(stripPlaceholders(raw)) : stripPlaceholders(raw);
    }
  } catch {
    welcome = directionMismatch ? stripInboundThanks(stripPlaceholders(raw)) : stripPlaceholders(raw);
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
// Caller-affect → one prompt line. Kept short and behavioral: tell the model
// HOW to respond, not just what was detected.
const AFFECT_PROMPTS = {
  rushed: 'The caller sounds rushed — be brisk and efficient, skip pleasantries, get straight to the answer.',
  hesitant: 'The caller sounds hesitant or unsure — be patient and reassuring, offer to clarify, avoid rapid-fire questions.',
  agitated: 'The caller sounds agitated or frustrated — acknowledge their frustration first, stay calm and concrete, do not be chirpy.',
  quiet: 'The caller is speaking softly — keep a gentle, unhurried, warm tone.',
};

/**
 * Assemble the provider-facing prompt: static instructions, the KB, the prior
 * turns and the current message.
 *
 * THIS IS WHAT MAKES THE KB CACHEABLE, so the ordering is load-bearing.
 * Measured against the live API (backend/scratch/probe_gemini_cache4.mjs and
 * 5.mjs) on gemini-2.5-flash and gemini-3.1-flash-lite:
 *   1. A KB sitting in the system instruction is NEVER cached — 0%, every turn.
 *      Implicit caching only ever matched a prefix of contents[].
 *   2. Appending the transcript (or a per-turn affect line) to the system prompt
 *      drops the hit rate to 0% even when the KB is in contents[].
 * Hence: the system prompt must be STATIC per agent, the KB must be the first
 * conversation turn, and anything varying per turn must come after both.
 * Measured result: 87-88% of prompt tokens cached from turn 2 on, ~73% fewer
 * full-price tokens per call.
 *
 * The same rule binds anything added later — per-contact campaign variables,
 * A/B prompt tweaks, time-of-day greetings. Put them in `lastContent`, never in
 * the system prompt, or every agent's hit rate goes back to zero.
 *
 * Providers without structured history (custom endpoints, mock) keep the old
 * transcript-in-system-prompt shape: they gain no caching, but they must not
 * silently lose conversation memory.
 *
 * Pure and exported so these invariants are testable without a DB or network.
 */
export function buildRuntimeMessages({
  agent,
  kbText = '',
  prior = [],
  lastContent = '',
  affectNote = '',
  voiceMode = false,
  supportsChatHistory = false,
}) {
  if (!supportsChatHistory) {
    let systemPrompt = buildAgentSystemPrompt(agent, kbText, { voiceMode });
    if (prior.length) {
      const transcript = prior
        .map((m) => `${m.role === 'user' ? 'User' : agent.name}: ${m.content}`)
        .join('\n');
      systemPrompt += `\n\n# Conversation so far (welcome message included; continue from here)\n${transcript}`;
    }
    if (affectNote) {
      systemPrompt += `\n\n# Caller state (detected from their voice this turn)\n${affectNote}`;
    }
    return { systemPrompt, chatHistory: [], message: lastContent };
  }

  const chatHistory = [];
  if (kbText) {
    chatHistory.push({ role: 'user', content: `${KB_MESSAGE_HEADER}\n${kbText}` });
    chatHistory.push({ role: 'assistant', content: KB_MESSAGE_ACK });
  }
  chatHistory.push(...prior);

  return {
    systemPrompt: buildAgentSystemPrompt(agent, kbText, { voiceMode, kbInline: false }),
    chatHistory,
    // Affect rides on the current turn, never the system prompt.
    message: affectNote
      ? `${lastContent}\n\n[Voice note, not spoken aloud by the caller: ${affectNote}]`
      : lastContent,
  };
}

async function _prepareConverse(workspaceId, agentId, messages, { voiceMode = false, affect = null } = {}) {
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
  const promptKb = voiceMode ? kbText.slice(0, KB_VOICE_CHARS) : kbText;
  const prior = history.slice(0, -1);
  const affectNote = voiceMode && affect && AFFECT_PROMPTS[affect] ? AFFECT_PROMPTS[affect] : '';

  const { llm, provider, model } = resolveLlmForAgent(agent, { lowLatency: voiceMode });

  const { systemPrompt, chatHistory, message } = buildRuntimeMessages({
    agent,
    kbText: promptKb,
    prior,
    lastContent: last.content,
    affectNote,
    voiceMode,
    supportsChatHistory: Boolean(llm.supportsChatHistory),
  });
  // Brevity in voice mode is enforced by the prompt, not the token cap —
  // Gemini 2.5's internal "thinking" tokens count against maxTokens, so a
  // tight cap truncates replies mid-sentence. Thinking is disabled for ALL
  // conversation turns (chat AND voice): a persona chat grounded in a KB
  // doesn't need a reasoning pass, and it costs ~2-3s per reply.
  const options = { systemPrompt, chatHistory, maxTokens: voiceMode ? 320 : 2000, thinkingBudget: 0 };
  const config = { model, temperature: DEFAULT_TEMPERATURE };
  return { agent, message, llm, provider, model, config, options, voiceMode };
}

// Markdown → speakable text. The reply is sent to TTS, so strip formatting.
const stripForVoice = (s) => s.replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim();

export async function converse(workspaceId, agentId, messages, { voiceMode = false, affect = null } = {}) {
  const { agent, message, llm, provider, model, config, options } =
    await _prepareConverse(workspaceId, agentId, messages, { voiceMode, affect });

  const raw = await llm.generateResponse(message, config, options);
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
export async function* converseStream(workspaceId, agentId, messages, { voiceMode = false, affect = null } = {}) {
  const { message, llm, provider, model, config, options } =
    await _prepareConverse(workspaceId, agentId, messages, { voiceMode, affect });

  if (typeof llm.generateResponseStream === 'function') {
    yield* llm.generateResponseStream(message, config, options);
  } else {
    // Non-streaming provider: one buffered call, emitted as a single chunk.
    const raw = await llm.generateResponse(message, config, options);
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

// ── Filler acknowledgments ("thinking sounds") ───────────────────────────────
// Short, pre-synthesized acknowledgments the agent can play near-instantly
// while the LLM is still generating, so a slow first token sounds like the
// agent taking a breath instead of dead air. Synthesized ONCE per (voice,
// language) and cached as raw audio; emitting one is pure memory I/O.
// Rotated so back-to-back turns don't repeat the identical sound.
const FILLER_TEXTS = {
  en: ['Mm-hmm.', 'Okay, one second.', 'Right.'],
  // Gender-neutral phrasing on purpose — the voice may be male or female.
  hi: ['हम्म।', 'जी, एक सेकंड।'],
};
const fillerCache = new Map(); // `${voiceId}|${lang}` -> { variants: [{buf, contentType}], next }
const fillerWarmInFlight = new Set();

/** Pre-synthesize this voice's filler variants (idempotent, fire-and-forget). */
export async function warmFillers(voice, lang, pace) {
  if (!voice) return;
  const key = `${voice.id}|${lang}`;
  if (fillerCache.has(key) || fillerWarmInFlight.has(key)) return;
  fillerWarmInFlight.add(key);
  try {
    const variants = [];
    for (const text of FILLER_TEXTS[lang] || FILLER_TEXTS.en) {
      const { stream, contentType } = await streamSynthesizeVoice(voice, text, { fast: true, pace });
      const chunks = [];
      for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      const buf = Buffer.concat(chunks);
      if (buf.length) variants.push({ buf, contentType });
    }
    if (variants.length) fillerCache.set(key, { variants, next: 0 });
  } catch (err) {
    logger.warn(`Filler synthesis failed (${lang}): ${err.message}`);
  } finally {
    fillerWarmInFlight.delete(key);
  }
}

function takeFiller(voice, lang) {
  const entry = fillerCache.get(`${voice.id}|${lang}`);
  if (!entry || !entry.variants.length) return null;
  const v = entry.variants[entry.next % entry.variants.length];
  entry.next += 1;
  return v;
}

const fillerLangFor = (settings, agent) => {
  let langs = [];
  try { langs = JSON.parse(agent.languages || '[]'); } catch { /* ignore */ }
  return /hindi|^hi\b/i.test(String(settings.sttLanguage || langs[0] || '')) ? 'hi' : 'en';
};

/**
 * Warm every cache a voice turn touches (agent row, KB text, voice resolution,
 * filler audio) — called by the WS handler on `start-turn`, i.e. WHILE THE
 * CALLER IS STILL SPEAKING, so a cold cache is paid in parallel with their
 * speech instead of serially after it (the prepMs spikes in latency.log).
 */
export function warmVoiceTurn(workspaceId, agentId) {
  (async () => {
    const agent = await loadAgent(workspaceId, agentId);
    if (!agent) return;
    const settings = safeJson(agent.settings, {});
    getAgentKbText(workspaceId, agentId).catch(() => {});
    const voice = await resolveAgentVoice(agent.voice).catch(() => null);
    const fillerEnabled = process.env.VOICE_FILLER === 'always'
      || (settings.fillerWords === true && process.env.VOICE_FILLER !== 'false');
    if (voice && fillerEnabled) {
      warmFillers(voice, fillerLangFor(settings, agent), Number(settings.speakingRate) || 1.05);
    }
  })().catch(() => {});
}

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
  //
  // BUG-001: same STT-hallucination problem as voiceTurnStream — batch STT
  // answers silence with stock subtitle filler, all of it longer than two
  // characters. This path has no PCM to analyse (it receives an encoded blob),
  // so it passes audioHadSpeech: true, which applies ONLY the unambiguous
  // artifact tier ("Thanks for watching!", "[BLANK_AUDIO]", punctuation-only).
  // Without acoustic evidence it would be wrong to also drop backchannels like
  // "okay" — a caller genuinely says those, and silently discarding them would
  // trade a phantom-turn bug for a deaf-agent bug.
  if (!userText || userText.length < 2
    || isLikelySttHallucination(userText, { audioHadSpeech: true })) {
    if (userText) {
      logger.info(`voiceTurn: discarding likely STT artifact "${userText}" (provider=${sttProvider})`);
    }
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
export async function voiceTurnStream(workspaceId, agentId, audioBuffer, mimeType, history = [], { onEvent, shouldAbort, userText: providedText, audioHadSpeech = false, affect = null } = {}) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const aborted = typeof shouldAbort === 'function' ? shouldAbort : () => false;
  const turnStartedAt = performance.now();

  const agent = await loadAgent(workspaceId, agentId);
  if (!agent) {
    const err = new Error('Agent not found in this workspace');
    err.statusCode = 404;
    throw err;
  }
  // prepMs: agent load (remote DB on cache miss). Logged so no turn time is
  // unaccounted — this was the invisible 0.5-2s gap between ttfaMs and the
  // sum of stt/llm/tts in earlier logs.
  const prepMs = Math.round(performance.now() - turnStartedAt);
  const settings = safeJson(agent.settings, {});
  const preferredProvider = settings.sttProvider || agent.transcription;
  const languageCode = settings.sttLanguage && settings.sttLanguage !== 'Multi'
    ? settings.sttLanguage
    : undefined;
  const baseRate = Number(settings.speakingRate) || 1.05;
  // Delivery-level adaptation: match the caller's energy slightly (rushed →
  // a touch quicker, hesitant/quiet → a touch calmer) plus ±0.02 per-turn
  // jitter so consecutive replies don't land with machine-identical rhythm.
  const affectPace = affect === 'rushed' ? 0.05 : (affect === 'hesitant' || affect === 'quiet') ? -0.04 : 0;
  const speakingRate = Math.min(1.2, Math.max(0.8, baseRate + affectPace + (Math.random() * 0.04 - 0.02)));

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

  // ── Silence / noise only — resume listening without an LLM/TTS call ────────
  //
  // BUG-001: `userText.length < 2` was the ONLY guard here, and it does not
  // catch the failure it needed to. Batch STT does not return an empty string
  // on silence — it returns stock filler learned from subtitle corpora
  // ("Thank you.", "Thanks for watching!", "धन्यवाद", "。"). Every one of those
  // is longer than two characters, so it passed, became a user turn, and the
  // LLM answered text the caller never said.
  //
  // The hallucination filter is applied ONLY to the batch path. A transcript
  // from streaming STT (sttProvider === 'stream') is trustworthy: Deepgram was
  // listening live and returns nothing rather than inventing filler, so
  // second-guessing it would only risk dropping real speech.
  const isBatch = sttProvider !== 'stream';
  if (!userText || userText.length < 2
    || (isBatch && isLikelySttHallucination(userText, { audioHadSpeech }))) {
    if (userText) {
      logger.info(
        `Discarding likely STT artifact "${userText}" (provider=${sttProvider}, ` +
        `audioHadSpeech=${audioHadSpeech}) — not starting an agent turn`,
      );
    }
    emit({ type: 'transcript', userText: '' });
    emit({ type: 'done', reply: null, timings: { sttMs, llmMs: 0, ttsMs: 0, ttfaMs: 0, totalMs: Math.round(performance.now() - turnStartedAt) } });
    return;
  }
  emit({ type: 'transcript', userText });

  const voiceWaitStart = performance.now();
  const voice = await voicePromise;
  // Time actually BLOCKED on voice resolution (0 when the cache/parallel fetch
  // already finished during STT) — logged to keep every ms accounted for.
  const voiceWaitMs = Math.round(performance.now() - voiceWaitStart);
  const messages = [...history, { role: 'user', content: userText }];

  // Filler acknowledgment: if no real reply audio has started within the delay,
  // play a cached "mm-hmm"-style segment so the caller hears the agent react
  // essentially instantly even when the LLM takes a second. Emitted as its own
  // audio segment (pure memory I/O — the audio was synthesized at call start
  // via warmVoiceTurn). Never counted as the reply's first audio in the logs.
  let fillerPlayed = false;
  let fillerTimer = null;
  // Gated by the agent's existing "Filler Words" Call-Configuration toggle
  // (VOICE_FILLER=always forces it on for testing, =false kills it globally).
  const fillerEnabled = process.env.VOICE_FILLER === 'always'
    || (settings.fillerWords === true && process.env.VOICE_FILLER !== 'false');
  if (voice && fillerEnabled) {
    const fillerDelayMs = Number(process.env.VOICE_FILLER_DELAY_MS) || 400;
    const lang = fillerLangFor(settings, agent);
    fillerTimer = setTimeout(() => {
      if (audioStarted || aborted()) return; // reply already speaking / barged
      const f = takeFiller(voice, lang);
      if (!f) { warmFillers(voice, lang, speakingRate); return; } // cold: warm for next turn
      fillerPlayed = true;
      emit({ type: 'audio-start', contentType: f.contentType });
      emit({ type: 'audio-chunk', data: f.buf.toString('base64') });
      emit({ type: 'audio-end' });
    }, fillerDelayMs);
  }

  // Reply generation + TTS.
  //
  // Two paths, chosen by TTS provider:
  //  • OVERLAP (ElevenLabs): stream the LLM's tokens and synthesize each sentence
  //    the instant it's complete, so the caller hears sentence 1 while the model
  //    is still writing sentence 2 — first audio lands ~0.8s in instead of after
  //    the whole reply. Safe here because ElevenLabs Flash is consistent
  //    per-request (unlike Sarvam's stochastic streaming TTS, which drifted in
  //    voice/pace when synthesized sentence-by-sentence).
  //  • SINGLE-CALL (Sarvam / others, or LLM-spike fallback): one converse() + one
  //    TTS call — one generation, consistent voice, no LLM overlap.
  //
  // Both cap the LLM's occasional latency spikes (gemini-3.1-flash-lite usually
  // ~1.5-2.3s but sometimes stalls 8-13s — see logs/latency.log): a timeout
  // falls back to a fresh attempt. Two thresholds because they measure
  // different things: the overlap path races the FIRST TOKEN (healthy: Groq
  // <1s, Gemini <1.5s → 2.5s catches spikes early), the single-call path races
  // the WHOLE reply (healthy Gemini runs up to ~3s → needs the 4s headroom so
  // normal turns never pay a wasted retry).
  const LLM_FIRST_TOKEN_TIMEOUT_MS = Number(process.env.VOICE_LLM_FIRST_TOKEN_TIMEOUT_MS) || 2500;
  const LLM_SPIKE_TIMEOUT_MS = Number(process.env.VOICE_LLM_SPIKE_TIMEOUT_MS) || 4000;
  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('llm-timeout')), ms)),
  ]);
  // TOKEN-STREAMING overlap (opt in with VOICE_TTS_OVERLAP=true): LLM tokens are
  // fed straight into a socket-based TTS session, so ONE continuous audio stream
  // comes back and the agent speaks while the reply is still being written.
  //
  // The "one continuous stream" part is load-bearing. An earlier attempt
  // synthesized each sentence as a SEPARATE MP3 and appended them to a single
  // MediaSource; independent MP3s don't share frame alignment, so the decoder
  // lost sync at every boundary and played fluent non-language noise. Per-
  // segment playback (see streamTtsForText) fixed that for the HTTP path, and
  // this path sidesteps it entirely by never producing a second file.
  //
  // Which providers can do it is a capability lookup, not a hardcoded name —
  // ElevenLabs and Fish Audio today; anything else falls to the split path.
  const canOverlap = process.env.VOICE_TTS_OVERLAP === 'true'
    && supportsTokenStreaming(voice);

  let reply = '';
  let provider;
  let model;
  let llmMs = 0;
  let ttsMs = 0;
  let firstAudioAt = null;
  let audioStarted = false;
  // Waterfall instrumentation: llmMs alone conflates "time to first token"
  // (what the caller feels) with "time to finish generating" (what nobody
  // hears). Split them so the log can say which stage actually gates ttfa.
  let llmTtftMs = null;   // LLM time-to-first-token
  let firstTtsTextAt = null; // when the first speakable text reached TTS

  // Synthesize one text chunk and forward its bytes as ONE audio SEGMENT
  // (its own audio-start … chunks … audio-end). Segments never share a
  // MediaSource client-side, so independently-encoded MP3s can't corrupt each
  // other — the failure that forced the old per-sentence overlap off. The
  // client queues segments and plays them back-to-back.
  const streamTtsForText = async (text) => {
    const clean = stripForVoice(text);
    if (!clean || !voice || aborted()) return;
    const ttsStart = performance.now();
    if (firstTtsTextAt == null) firstTtsTextAt = ttsStart;
    try {
      const { stream, contentType } = await streamSynthesizeVoice(voice, clean, { fast: true, pace: speakingRate, affect });
      if (aborted()) return;
      audioStarted = true;
      emit({ type: 'audio-start', contentType });
      for await (const c of stream) {
        if (aborted()) break; // barge-in: stop shovelling audio nobody's hearing
        if (firstAudioAt == null) firstAudioAt = performance.now();
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
        if (buf.length) emit({ type: 'audio-chunk', data: buf.toString('base64') });
      }
      emit({ type: 'audio-end' });
    } catch (err) {
      logger.warn(`voiceTurnStream TTS failed: ${err.message}`);
    }
    ttsMs += Math.round(performance.now() - ttsStart);
  };

  const llmStartedAt = performance.now();
  let handled = false;
  let ttsMode = 'buffered'; // 'ws-overlap' | 'split' | 'buffered' — for the log

  if (canOverlap) {
    // TRUE overlap: feed LLM tokens into ONE socket TTS stream, so the agent
    // starts speaking on the first words while the reply is still being
    // generated. One continuous stream → no concatenation corruption.
    const ttsStart = performance.now();
    const ttsProvider = synthesisProviderName(voice);
    const tts = createTokenTtsStream(voice, { pace: speakingRate, affect });
    let wsSegmentOpen = false; // this path is ONE continuous stream = one segment
    const audioDone = new Promise((resolve) => {
      tts?.on('audio', (buf) => {
        if (aborted() || !buf.length) return;
        if (!wsSegmentOpen) { wsSegmentOpen = true; audioStarted = true; emit({ type: 'audio-start', contentType: 'audio/mpeg' }); }
        if (firstAudioAt == null) firstAudioAt = performance.now();
        emit({ type: 'audio-chunk', data: buf.toString('base64') });
      });
      tts?.once('done', resolve);
      tts?.once('error', (e) => { logger.warn(`${ttsProvider} WS TTS error: ${e.message}`); resolve(); });
      if (!tts) resolve();
    });

    // supportsTokenStreaming() already vetted this, but the factory can still
    // decline (e.g. a clone whose upstream id went missing) — treat it exactly
    // like a failed connect and fall through to the split path.
    let connected = Boolean(tts);
    try { tts?.connect(); } catch (e) { connected = false; logger.warn(`${ttsProvider} WS TTS connect failed: ${e.message}`); }

    if (connected) {
      const iterator = converseStream(workspaceId, agentId, messages, { voiceMode: true, affect });
      let first;
      try {
        first = await withTimeout(iterator.next(), LLM_FIRST_TOKEN_TIMEOUT_MS);
      } catch {
        first = null; // first-token spike — abandon overlap, fall back to single-call
        iterator.return?.().catch(() => {});
        tts.close();
        logger.warn(`Voice LLM slow first token (>${LLM_FIRST_TOKEN_TIMEOUT_MS}ms) — falling back to single-call`);
      }
      if (first) {
        llmTtftMs = Math.round(performance.now() - llmStartedAt);
        let result = first;
        while (!result.done) {
          reply += result.value;
          if (aborted()) { await iterator.return?.(); break; }
          if (firstTtsTextAt == null) firstTtsTextAt = performance.now();
          tts.pushText(result.value); // stream the token straight into TTS
          result = await iterator.next();
        }
        if (result.done) ({ provider, model } = result.value || {});
        llmMs = Math.round(performance.now() - llmStartedAt); // LLM done (audio may still be arriving)
        if (aborted()) tts.close(); else tts.end();
        await audioDone;
        if (wsSegmentOpen) emit({ type: 'audio-end' });
        // If the WS produced no audio (connect/protocol issue), speak the reply
        // we already have via the single-call path — no extra LLM call.
        if (!audioStarted && reply && !aborted()) await streamTtsForText(reply);
        ttsMs = Math.round(performance.now() - ttsStart);
        reply = stripForVoice(reply);
        handled = true;
        ttsMode = 'ws-overlap';
      }
    }
  }

  if (!handled && voice && process.env.VOICE_SENTENCE_SPLIT !== 'false') {
    // FIRST-SENTENCE SPLIT (any provider with a streaming TTS endpoint —
    // Sarvam, ElevenLabs HTTP). Stream the LLM's tokens; the moment the first
    // sentence is complete, synthesize it as its own audio SEGMENT while the
    // rest of the reply is still being generated, then synthesize the
    // remainder as a second segment. Two generations, not one per sentence —
    // deliberately, because Sarvam's synthesis is stochastic per-request and
    // splitting every sentence made the voice audibly drift mid-reply. This
    // captures most of the overlap win (first audio ≈ TTFT + one sentence +
    // TTS first-byte instead of full-reply + TTS) with only one seam.
    const iterator = converseStream(workspaceId, agentId, messages, { voiceMode: true, affect });
    let first = null;
    try {
      first = await withTimeout(iterator.next(), LLM_FIRST_TOKEN_TIMEOUT_MS);
    } catch {
      iterator.return?.().catch(() => {});
      logger.warn(`Voice LLM slow first token (>${LLM_FIRST_TOKEN_TIMEOUT_MS}ms) — falling back to buffered call`);
    }
    if (first && !first.done) {
      llmTtftMs = Math.round(performance.now() - llmStartedAt);
      // First sentence = earliest terminator that ends a ≥25-char prefix AND is
      // followed by whitespace (never end-of-buffer: "3." mid-number must not
      // cut). Includes the Hindi danda for Devanagari replies.
      const boundary = /[.!?…।॥]["')\]]?\s/g;
      let splitIdx = -1;
      let firstSegment = null; // in-flight synthesis of sentence 1
      let result = first;
      while (!result.done) {
        reply += result.value;
        if (aborted()) { await iterator.return?.(); break; }
        if (splitIdx < 0) {
          boundary.lastIndex = 0;
          let m;
          while ((m = boundary.exec(reply)) !== null) {
            if (m.index + m[0].length >= 25) { splitIdx = m.index + m[0].length; break; }
          }
          if (splitIdx > 0) firstSegment = streamTtsForText(reply.slice(0, splitIdx));
        }
        result = await iterator.next();
      }
      if (result.done) ({ provider, model } = result.value || {});
      llmMs = Math.round(performance.now() - llmStartedAt);
      // splitIdx indexes the RAW reply — take the remainder before stripping,
      // or the seam would duplicate/drop characters.
      const rest = splitIdx > 0 ? reply.slice(splitIdx) : '';
      reply = stripForVoice(reply);
      if (firstSegment) {
        await firstSegment;
        if (rest.trim() && !aborted()) await streamTtsForText(rest);
      } else if (reply && !aborted()) {
        await streamTtsForText(reply); // no boundary found — speak it whole
      }
      handled = true;
      ttsMode = 'split';
    }
  }

  if (!handled) {
    // BUFFERED fallback (no voice / split disabled / LLM first-token spike).
    const runConverse = () => converse(workspaceId, agentId, messages, { voiceMode: true, affect });
    let converseResult;
    try {
      converseResult = await withTimeout(runConverse(), LLM_SPIKE_TIMEOUT_MS);
    } catch {
      logger.warn(`Voice LLM slow (>${LLM_SPIKE_TIMEOUT_MS}ms) — retrying once`);
      converseResult = await runConverse(); // fresh attempt; almost always fast
    }
    ({ provider, model } = converseResult);
    reply = stripForVoice(converseResult.reply || '');
    llmMs = Math.round(performance.now() - llmStartedAt);
    llmTtftMs = llmMs; // buffered call: first token only exists once the reply is done
    if (reply && !aborted()) await streamTtsForText(reply);
  }

  // Segments close themselves (audio-end is emitted per segment above); the
  // reply text reaches the client in the 'done' event. If nothing was
  // synthesized (empty reply / no voice / TTS failure), no audio frames were
  // emitted at all — the client resumes listening off 'done'.

  const totalMs = Math.round(performance.now() - turnStartedAt);
  const ttfaMs = firstAudioAt != null ? Math.round(firstAudioAt - turnStartedAt) : totalMs;

  // ttsTtfaMs: how long TTS itself took to produce its first byte once it had
  // text to speak — isolates the TTS provider's contribution from LLM wait.
  const ttsTtfaMs = firstAudioAt != null && firstTtsTextAt != null
    ? Math.round(firstAudioAt - firstTtsTextAt) : null;
  if (fillerTimer) clearTimeout(fillerTimer);
  const latency = { agentId, sttProvider, llmProvider: provider, model, prepMs, sttMs, voiceWaitMs, llmMs, llmTtftMs, ttsMs, ttsTtfaMs, ttfaMs, totalMs, streamed: true, mode: ttsMode, filler: fillerPlayed };
  logger.info(latency, 'Web call streaming turn latency');
  logTurnLatency(latency);

  emit({ type: 'done', reply, timings: { sttMs, llmMs, ttsMs, ttfaMs, totalMs } });
  return { userText, reply, timings: { sttMs, llmMs, ttsMs, ttfaMs, totalMs } };
}
