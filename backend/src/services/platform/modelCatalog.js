/**
 * THE platform model catalogue — which models clients are allowed to see.
 *
 * Every model this platform can run is declared here once, in one list, across
 * all four surfaces:
 *
 *   conversational — bundled speech-to-speech engines (settings.voiceEngine)
 *   llm            — the reasoning model in the modular pipeline (agent.aiModel)
 *   stt            — transcription providers (agent.transcription / sttProvider)
 *   tts            — voice providers (the Voice picker)
 *
 * Super Admin → Models flips each entry on or off. Off means the entry is not
 * returned by any client-facing endpoint AND cannot be saved onto an agent, so
 * a client cannot reach it by hand-crafting a request either. The admin panel
 * is the only place that sees the full list.
 *
 * ── Why the state lives in a Plan row ────────────────────────────────────────
 * Same reason and same trade-off as services/billing/walletRate.js: there is no
 * key/value settings table in the schema and adding one means a migration
 * against the live database. This squats on ONE reserved, inactive `Plan` row
 * whose `features` column (already a JSON string) holds the override map. If a
 * proper `Setting` model is ever added, move the value and delete this note —
 * readOverrides/writeOverrides are the only two functions that change.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';

/** Reserved. Inactive, so listAssignablePlans() never offers it. */
export const MODEL_CATALOG_PLAN = '__model_catalog__';

/**
 * The canonical catalogue.
 *
 * `id` is the stable key the override map is written against — never rename
 * one, or an admin's earlier "off" decision silently becomes "on".
 *
 * `value` is what the client actually stores on the agent for that entry, and
 * is what enforcement compares against. For LLMs it is the canonical model id
 * (mapAgentModel matches those exactly, before its label heuristics), so a
 * saved agent resolves to precisely the model the admin allowed.
 */
export const MODEL_GROUPS = [
  {
    key: 'conversational',
    label: 'Conversational (speech-to-speech)',
    description:
      'Bundled engines that replace the whole modular pipeline — the client picks one instead of an LLM, STT and TTS.',
    models: [
      { id: 'conversational:xai',        value: 'xai',        label: 'xAI Grok Voice Agent',       provider: 'xAI',        envKey: 'XAI_API_KEY' },
      { id: 'conversational:elevenlabs', value: 'elevenlabs', label: 'ElevenLabs Conversational AI', provider: 'ElevenLabs', envKey: 'ELEVENLABS_API_KEY' },
    ],
  },
  {
    key: 'llm',
    label: 'AI Model (LLM)',
    description: 'The reasoning model in the modular pipeline.',
    models: [
      { id: 'llm:openai:gpt-4o',           value: 'gpt-4o',            label: 'GPT-4o',            provider: 'OpenAI', envKey: 'OPENAI_API_KEY' },
      { id: 'llm:openai:gpt-4o-mini',      value: 'gpt-4o-mini',       label: 'GPT-4o Mini',       provider: 'OpenAI', envKey: 'OPENAI_API_KEY' },
      { id: 'llm:openai:gpt-4.1-mini',     value: 'gpt-4.1-mini',      label: 'GPT-4.1 Mini',      provider: 'OpenAI', envKey: 'OPENAI_API_KEY' },
      { id: 'llm:openai:gpt-4.1-nano',     value: 'gpt-4.1-nano',      label: 'GPT-4.1 Nano',      provider: 'OpenAI', envKey: 'OPENAI_API_KEY' },
      { id: 'llm:openai:gpt-3.5-turbo',    value: 'gpt-3.5-turbo',     label: 'GPT-3.5 Turbo',     provider: 'OpenAI', envKey: 'OPENAI_API_KEY' },
      { id: 'llm:openai:gpt-5.1',          value: 'gpt-5.1',           label: 'GPT-5.1',           provider: 'OpenAI', envKey: 'OPENAI_API_KEY' },
      { id: 'llm:gemini:2.5-flash',        value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',      provider: 'Google', envKey: 'GEMINI_API_KEY' },
      { id: 'llm:gemini:2.5-flash-lite',   value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'Google', envKey: 'GEMINI_API_KEY' },
      { id: 'llm:azure:gpt-4o',            value: 'azure-gpt-4o',       label: 'Azure GPT-4o',       provider: 'Azure', envKey: 'AZURE_OPENAI_KEY' },
      { id: 'llm:azure:gpt-4o-mini',       value: 'azure-gpt-4o-mini',  label: 'Azure GPT-4o Mini',  provider: 'Azure', envKey: 'AZURE_OPENAI_KEY' },
      { id: 'llm:azure:gpt-4.1-mini',      value: 'azure-gpt-4.1-mini', label: 'Azure GPT-4.1 Mini', provider: 'Azure', envKey: 'AZURE_OPENAI_KEY' },
      { id: 'llm:azure:gpt-4.1-nano',      value: 'azure-gpt-4.1-nano', label: 'Azure GPT-4.1 Nano', provider: 'Azure', envKey: 'AZURE_OPENAI_KEY' },
      // Groq's LPU endpoint — the low-latency choice for voice (measured first
      // spoken token ~560-720ms, against ~1.7s p50 for Gemini flash-lite).
      //
      // `value` is FROZEN at the original string: mapAgentModel keys off it
      // containing "groq", and every agent already on this option has it stored
      // in its aiModel column. Renaming it would silently drop those agents back
      // to the default provider.
      //
      // The LABEL no longer names Llama, because Groq retired
      // llama-3.3-70b-versatile and the id 404s. What this option actually runs
      // is GROQ_MODEL (default openai/gpt-oss-20b, see groq.service.js), so a
      // label promising Llama sent people to a model they were not getting.
      // Naming the vendor rather than the weights keeps it honest the next time
      // the underlying id is retired.
      { id: 'llm:groq:llama-3.3-70b',      value: 'Groq Llama 3.3',          label: 'Groq (fastest — for voice)', provider: 'Groq',   envKey: 'GROQ_API_KEY' },
      // The self-hosted/custom Llama endpoint. Separately switchable from the
      // Groq entry above because the two bill differently.
      { id: 'llm:custom:llama-3.3-70b',    value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (custom endpoint)', provider: 'Custom', envKey: 'CUSTOM_LLM_BASE_URL' },
    ],
  },
  {
    key: 'stt',
    label: 'Transcription (STT)',
    description: 'Speech-to-text providers offered in the agent Transcription picker.',
    models: [
      { id: 'stt:deepgram', value: 'deepgram_stream',     label: 'Deepgram (streaming)', provider: 'Deepgram', envKey: 'DEEPGRAM_API_KEY' },
      { id: 'stt:sarvam',   value: 'Sarvam',              label: 'Sarvam AI',            provider: 'Sarvam',   envKey: 'SARVAM_API_KEY' },
      { id: 'stt:azure',    value: 'Azure',               label: 'Azure Speech',         provider: 'Azure',    envKey: 'AZURE_SPEECH_KEY' },
      { id: 'stt:soniox',   value: 'Soniox',              label: 'Soniox',               provider: 'Soniox',   envKey: 'SONIOX_API_KEY' },
      { id: 'stt:standard', value: 'Standard Providers',  label: 'Standard Providers',   provider: 'Platform' },
    ],
  },
  {
    key: 'tts',
    label: 'Voice (TTS)',
    description:
      'Voice providers offered in the Voice picker. Turning one off hides every voice belonging to it.',
    models: [
      { id: 'tts:google',     value: 'Google',     label: 'Google Cloud TTS', provider: 'Google',     envKey: 'GOOGLE_APPLICATION_CREDENTIALS' },
      { id: 'tts:elevenlabs', value: 'ElevenLabs', label: 'ElevenLabs',       provider: 'ElevenLabs', envKey: 'ELEVENLABS_API_KEY' },
      { id: 'tts:sarvam',     value: 'Sarvam',     label: 'Sarvam AI',        provider: 'Sarvam',     envKey: 'SARVAM_API_KEY' },
      { id: 'tts:cartesia',   value: 'Cartesia',   label: 'Cartesia',         provider: 'Cartesia',   envKey: 'CARTESIA_API_KEY' },
      { id: 'tts:fishaudio',  value: 'FishAudio',  label: 'Fish Audio',       provider: 'FishAudio',  envKey: 'FISH_API_KEY' },
    ],
  },
];

/** Flat id → model lookup, built once. */
const BY_ID = new Map(
  MODEL_GROUPS.flatMap((g) => g.models.map((m) => [m.id, { ...m, group: g.key }])),
);

const ALL_IDS = [...BY_ID.keys()];

// ─── Override storage ─────────────────────────────────────────────────────────
//
// Only explicit decisions are stored, as { [id]: boolean }. An id that is absent
// defaults to ENABLED — so a model added to MODEL_GROUPS in a later release is
// live the moment it ships, rather than being invisible until someone notices.
// An admin who wants it off turns it off, and that decision is then recorded.

/** In-process cache. The catalogue is read on nearly every agent save. */
let cache = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/** Drop the cache so the next read sees a just-saved change immediately. */
export function invalidateModelCatalogCache() {
  cache = null;
  cachedAt = 0;
}

async function readOverrides() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  let row = await prisma.plan.findUnique({ where: { name: MODEL_CATALOG_PLAN } });
  if (!row) {
    row = await prisma.plan.create({
      data: {
        name: MODEL_CATALOG_PLAN,
        priceUsd: 0, priceInr: 0, perMinuteUsd: 0, perMinuteInr: 0,
        includedMinutes: 0, kbStorageMb: 0, maxAgents: 0, maxConcurrentCalls: 0,
        features: '{}',
        // Inactive and sorted out of the way: this is not a subscribable plan
        // and must never appear in listAssignablePlans().
        active: false,
        sortOrder: -2,
      },
    });
    logger.info('Seeded platform model catalogue (all models enabled)');
  }

  let parsed;
  try {
    parsed = JSON.parse(row.features || '{}');
  } catch {
    // A corrupt column must not black out every model. Fail open to "all
    // enabled" — the same state a fresh install has — and say so loudly.
    logger.error({ features: row.features }, 'Model catalogue JSON is corrupt; treating all models as enabled');
    parsed = {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};

  cache = parsed;
  cachedAt = Date.now();
  return cache;
}

async function writeOverrides(overrides) {
  await readOverrides(); // ensure the row exists
  await prisma.plan.update({
    where: { name: MODEL_CATALOG_PLAN },
    data: { features: JSON.stringify(overrides) },
  });
  cache = overrides;
  cachedAt = Date.now();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The full catalogue with each entry's current enabled state.
 * Admin-only — clients get getEnabledValues() instead.
 *
 * @returns {Promise<Array<{ key, label, description, models: Array<object & { enabled: boolean, configured: boolean }> }>>}
 */
export async function getCatalogForAdmin() {
  const overrides = await readOverrides();
  return MODEL_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    description: g.description,
    models: g.models.map((m) => ({
      id: m.id,
      value: m.value,
      label: m.label,
      provider: m.provider,
      enabled: overrides[m.id] !== false,
      // Whether the platform even has a credential for it. An admin can enable
      // an unconfigured model, but should see that it will fail at call time.
      configured: m.envKey ? Boolean(process.env[m.envKey]) : true,
    })),
  }));
}

/**
 * The client-facing view: only what this platform currently allows, with the
 * admin-only fields (env keys, configured state) stripped.
 *
 * @returns {Promise<Record<string, Array<{ value: string, label: string, provider: string }>>>}
 *          keyed by group: { conversational: [...], llm: [...], stt: [...], tts: [...] }
 */
export async function getEnabledCatalog() {
  const overrides = await readOverrides();
  const out = {};
  for (const g of MODEL_GROUPS) {
    out[g.key] = g.models
      .filter((m) => overrides[m.id] !== false)
      .map((m) => ({ value: m.value, label: m.label, provider: m.provider }));
  }
  return out;
}

/**
 * Apply a partial map of { id: boolean }. Unknown ids are rejected rather than
 * stored, so a typo cannot leave a dead key that looks like a setting.
 *
 * @param {Record<string, boolean>} updates
 * @returns {Promise<Record<string, boolean>>} the full override map after saving
 */
export async function setModelsEnabled(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw Object.assign(new Error('Expected an object of { modelId: boolean }'), { status: 400 });
  }
  const unknown = Object.keys(updates).filter((id) => !BY_ID.has(id));
  if (unknown.length) {
    throw Object.assign(new Error(`Unknown model id(s): ${unknown.join(', ')}`), { status: 400 });
  }

  const next = { ...(await readOverrides()) };
  for (const [id, on] of Object.entries(updates)) {
    if (typeof on !== 'boolean') {
      throw Object.assign(new Error(`"${id}" must be true or false`), { status: 400 });
    }
    // "Enabled" is the default, so an explicit true is stored as an absence —
    // that keeps the row small and lets defaults stay meaningful.
    if (on) delete next[id];
    else next[id] = false;
  }

  await writeOverrides(next);
  logger.info({ updates }, 'Platform model catalogue updated');
  return next;
}

/**
 * Is a stored agent value allowed right now?
 *
 * @param {'conversational'|'llm'|'stt'|'tts'} group
 * @param {string} value the value as saved on the agent
 * @returns {Promise<boolean>} true when allowed, and also true when the value
 *          matches nothing in the catalogue — an unrecognised legacy value is
 *          not something this gate is entitled to reject.
 */
export async function isModelAllowed(group, value) {
  if (value == null || value === '') return true;
  const overrides = await readOverrides();
  const entry = MODEL_GROUPS.find((g) => g.key === group)?.models
    .find((m) => String(m.value).toLowerCase() === String(value).toLowerCase());
  if (!entry) return true;
  return overrides[entry.id] !== false;
}

/** Human label for a value, for error messages. Falls back to the value. */
export function labelFor(group, value) {
  const entry = MODEL_GROUPS.find((g) => g.key === group)?.models
    .find((m) => String(m.value).toLowerCase() === String(value).toLowerCase());
  return entry?.label ?? value;
}

export { ALL_IDS };
