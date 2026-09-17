/**
 * Which LLM and which transcription model a call runs on.
 *
 * The client no longer chooses either. They pick a language and a voice; the
 * reasoning model and the recogniser are Super Admin's decision, made once for
 * the platform and, where a client needs something different, once for that
 * client — the same shape as pricing (services/billing/workspaceRate.js).
 *
 * ── Precedence, highest first ────────────────────────────────────────────────
 *   1. client override   Super Admin → Models → Client models, for one
 *                        workspace. Wins over everything, including agents
 *                        that kept their own model, because it is an explicit
 *                        decision about that client.
 *   2. the agent's own   An agent saved before this existed keeps the model it
 *                        was already running. Deploying this must not silently
 *                        move a live campaign onto a different LLM.
 *   3. platform default  Super Admin → Models → Platform defaults. What every
 *                        agent created from now on runs.
 *   4. server default    Nothing chosen anywhere: the deployment's env default
 *                        LLM (resolveLlmForAgent) and Deepgram's per-language
 *                        model pick — exactly what a call did before.
 *
 * "Kept its own model" is read from the agent row, not from a flag: a new agent
 * is created with an EMPTY aiModel/transcription (agent.controller.js), so a
 * non-empty value can only have been saved by the old editor. That keeps the
 * rollout free of any data backfill.
 *
 * ── Why the state lives in a Plan row ────────────────────────────────────────
 * The same trade-off as modelCatalog.js and walletRate.js: no settings table,
 * and a migration against the live database is not worth taking for a few
 * strings. ONE reserved, inactive `Plan` row holds both the defaults and the
 * per-client map in its `features` JSON. The process runs as a single PM2 fork,
 * so the in-process cache below is invalidated by every write and can never
 * disagree with the row for longer than a write takes.
 */
import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { findCatalogEntry, isModelAllowed } from './modelCatalog.js';

/** Reserved. Inactive, so no plan listing ever offers it. */
export const MODEL_ASSIGNMENTS_PLAN = '__model_assignments__';

/** The two stages Super Admin assigns. */
export const ASSIGNED_GROUPS = Object.freeze(['llm', 'stt']);

/**
 * What an agent that kept its own recogniser runs, and what the server falls
 * back to: Deepgram choosing the model per language and line. It is what every
 * call did before assignment existed — the stored `transcription` never picked
 * the live recogniser (see the stt group in modelCatalog.js).
 */
export const DEFAULT_STT = 'deepgram-auto';

const EMPTY_STATE = Object.freeze({ defaults: { llm: null, stt: null }, workspaces: {} });

const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The precedence rule itself, as a pure function — the part with consequences,
 * kept free of the database so it can be tested exhaustively.
 *
 * @param {{ agent?: { aiModel?: string|null, transcription?: string|null }|null,
 *           client?: { llm?: string|null, stt?: string|null }|null,
 *           defaults?: { llm?: string|null, stt?: string|null }|null }} input
 * @returns {{ llm: { value: string|null, source: 'client'|'agent'|'platform'|'server' },
 *             stt: { value: string, source: 'client'|'agent'|'platform'|'server' } }}
 *          `llm.value` is null only for 'server' — resolveLlmForAgent then uses
 *          the deployment's configured default.
 */
export function pickAssignedModels({ agent = null, client = null, defaults = null } = {}) {
  const pick = (override, own, platform, server) => {
    if (clean(override)) return { value: clean(override), source: 'client' };
    if (own) return { value: own, source: 'agent' };
    if (clean(platform)) return { value: clean(platform), source: 'platform' };
    return { value: server, source: 'server' };
  };

  // An older agent's transcription column held a provider label that never
  // chose the live recogniser; what that agent really runs is the per-language
  // pick, so that is what it keeps.
  const ownStt = clean(agent?.transcription) ? DEFAULT_STT : null;

  return {
    llm: pick(client?.llm, clean(agent?.aiModel), defaults?.llm, null),
    stt: pick(client?.stt, ownStt, defaults?.stt, DEFAULT_STT),
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * In-process cache. Read on every voice turn (the LLM) and at every call start
 * (the recogniser), so a cold read must not be paid per turn: a Supabase round
 * trip from the app server is ~1s of dead air. Stale entries are served while a
 * refresh runs in the background; every write replaces the cache outright.
 */
let cache = null;
let cachedAt = 0;
let refreshing = null;
const CACHE_TTL_MS = 5 * 60_000;

/** Coerce whatever the row holds into the expected shape. Never throws. */
export function normaliseState(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return structuredClone(EMPTY_STATE);
  const defaults = {
    llm: clean(parsed.defaults?.llm),
    stt: clean(parsed.defaults?.stt),
  };
  const workspaces = {};
  if (parsed.workspaces && typeof parsed.workspaces === 'object' && !Array.isArray(parsed.workspaces)) {
    for (const [id, row] of Object.entries(parsed.workspaces)) {
      const llm = clean(row?.llm);
      const stt = clean(row?.stt);
      if (llm || stt) workspaces[id] = { ...(llm ? { llm } : {}), ...(stt ? { stt } : {}) };
    }
  }
  return { defaults, workspaces };
}

async function readRow() {
  let row = await prisma.plan.findUnique({ where: { name: MODEL_ASSIGNMENTS_PLAN } });
  if (!row) {
    row = await prisma.plan.upsert({
      where: { name: MODEL_ASSIGNMENTS_PLAN },
      update: {},
      create: {
        name: MODEL_ASSIGNMENTS_PLAN,
        priceUsd: 0, priceInr: 0, perMinuteUsd: 0, perMinuteInr: 0,
        includedMinutes: 0, kbStorageMb: 0, maxAgents: 0, maxConcurrentCalls: 0,
        features: JSON.stringify(EMPTY_STATE),
        // Not a subscribable plan; inactive and sorted out of the way.
        active: false,
        sortOrder: -3,
      },
    });
    logger.info('Seeded model assignments (nothing assigned; calls run exactly as before)');
  }

  try {
    return normaliseState(JSON.parse(row.features || '{}'));
  } catch {
    // A corrupt column must not stop calls. Fall back to "nothing assigned",
    // which is the pre-assignment behaviour, and say so loudly.
    logger.error({ features: row.features }, 'Model assignments JSON is corrupt; treating as nothing assigned');
    return structuredClone(EMPTY_STATE);
  }
}

async function readState({ fresh = false } = {}) {
  const age = Date.now() - cachedAt;
  if (cache && !fresh) {
    if (age >= CACHE_TTL_MS && !refreshing) {
      refreshing = readRow()
        .then((state) => { cache = state; cachedAt = Date.now(); })
        .catch((err) => logger.warn({ err: err.message }, 'Model assignments refresh failed; serving the cached copy'))
        .finally(() => { refreshing = null; });
    }
    return cache;
  }
  const state = await readRow();
  cache = state;
  cachedAt = Date.now();
  return state;
}

async function writeState(state) {
  const next = normaliseState(state);
  await readRow(); // make sure the row exists
  await prisma.plan.update({
    where: { name: MODEL_ASSIGNMENTS_PLAN },
    data: { features: JSON.stringify(next) },
  });
  cache = next;
  cachedAt = Date.now();
  return next;
}

/**
 * Load the assignments before the first call needs them, so no caller's first
 * turn after a deploy pays the database read. Never throws.
 */
export async function primeModelAssignments() {
  try {
    await readState({ fresh: true });
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not pre-load model assignments; the first call will load them');
  }
}

/** Test seam: forget the cached state. */
export function invalidateModelAssignmentsCache() {
  cache = null;
  cachedAt = 0;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * The models a call on this agent runs, with where each came from.
 *
 * Never throws: if the assignments cannot be read at all, the call runs on what
 * the agent and the server already know — the same answer as before any of
 * this existed — rather than failing the turn.
 *
 * @param {{ workspaceId: string, aiModel?: string|null, transcription?: string|null }} agent
 */
export async function resolveAgentModels(agent) {
  let state = EMPTY_STATE;
  try {
    state = await readState();
  } catch (err) {
    logger.warn({ err: err.message, workspaceId: agent?.workspaceId }, 'Model assignments unavailable; using the agent and server defaults');
  }
  return pickAssignedModels({
    agent,
    client: agent?.workspaceId ? state.workspaces[agent.workspaceId] : null,
    defaults: state.defaults,
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Validate one assignment value. Empty clears; anything else must be a model in
 * the catalogue that is currently switched on — an admin cannot assign what
 * the Models page says is off.
 *
 * @returns {Promise<string|null>} the canonical catalogue value, or null to clear
 */
async function canonicalValue(group, value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'string') throw httpError(400, `${group} must be a model value or null`);
  const entry = findCatalogEntry(group, value);
  if (!entry) throw httpError(400, `"${value}" is not a known ${group === 'llm' ? 'LLM' : 'transcription model'}`);
  if (!(await isModelAllowed(group, entry.value))) {
    throw httpError(409, `"${entry.label}" is switched off under Model access. Switch it on before assigning it.`);
  }
  return entry.value;
}

/**
 * Apply a partial { llm?, stt? } onto an existing pair. A key that is absent is
 * left alone; a key present with null or '' clears it.
 */
async function applyPartial(current, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw httpError(400, 'Expected { llm?, stt? }');
  }
  const unknown = Object.keys(updates).filter((k) => !ASSIGNED_GROUPS.includes(k));
  if (unknown.length) throw httpError(400, `Unknown field(s): ${unknown.join(', ')}`);

  const next = { ...current };
  for (const group of ASSIGNED_GROUPS) {
    if (!(group in updates)) continue;
    next[group] = await canonicalValue(group, updates[group]);
  }
  return next;
}

/** Warnings worth showing next to a saved assignment, e.g. no API key on this server. */
export function configurationWarnings(pair) {
  const out = [];
  for (const group of ASSIGNED_GROUPS) {
    const entry = findCatalogEntry(group, pair?.[group]);
    if (entry?.envKey && !process.env[entry.envKey]) {
      out.push(`${entry.label} has no ${entry.envKey} on this server, so calls will fall back to another model.`);
    }
  }
  return out;
}

/** The platform defaults. */
export async function getModelDefaults() {
  return (await readState({ fresh: true })).defaults;
}

/**
 * Set the platform defaults. Partial: { llm } alone leaves stt untouched.
 * @returns {Promise<{ before: object, after: object }>}
 */
export async function setModelDefaults(updates) {
  const state = await readState({ fresh: true });
  const before = { ...state.defaults };
  const after = await applyPartial(state.defaults, updates);
  await writeState({ ...state, defaults: after });
  logger.info({ before, after }, 'Platform model defaults updated');
  return { before, after };
}

/**
 * Set or clear one client's override. Partial, as above. Clearing both removes
 * the client from the map entirely.
 * @returns {Promise<{ before: object, after: object }>}
 */
export async function setWorkspaceModels(workspaceId, updates) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!ws) throw httpError(404, 'Workspace not found');

  const state = await readState({ fresh: true });
  const before = { llm: state.workspaces[workspaceId]?.llm ?? null, stt: state.workspaces[workspaceId]?.stt ?? null };
  const after = await applyPartial(before, updates);

  const workspaces = { ...state.workspaces };
  if (after.llm || after.stt) workspaces[workspaceId] = after;
  else delete workspaces[workspaceId];

  await writeState({ ...state, workspaces });
  logger.info({ workspaceId, before, after }, 'Client model override updated');
  return { before, after };
}

/**
 * Everything the admin Models page needs in one read: the defaults, every
 * client with its override, and how many of its agents still run a model they
 * kept from before (those ignore the platform default, but not an override).
 */
export async function getAssignmentsForAdmin() {
  const [state, workspaces, agents] = await Promise.all([
    readState({ fresh: true }),
    prisma.workspace.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } }),
    prisma.agent.findMany({ select: { workspaceId: true, aiModel: true } }),
  ]);

  const counts = new Map();
  for (const a of agents) {
    const c = counts.get(a.workspaceId) ?? { agents: 0, ownModel: 0 };
    c.agents += 1;
    if (clean(a.aiModel)) c.ownModel += 1;
    counts.set(a.workspaceId, c);
  }

  return {
    defaults: state.defaults,
    warnings: configurationWarnings(state.defaults),
    workspaces: workspaces.map((w) => ({
      ...w,
      llm: state.workspaces[w.id]?.llm ?? null,
      stt: state.workspaces[w.id]?.stt ?? null,
      agents: counts.get(w.id)?.agents ?? 0,
      agentsWithOwnModel: counts.get(w.id)?.ownModel ?? 0,
    })),
  };
}

/**
 * Where a model is assigned right now. The Models page refuses to switch off a
 * model that is still the default or some client's override — that would leave
 * those calls on a model the page says is off.
 *
 * @param {'llm'|'stt'} group
 * @param {string} value
 * @returns {Promise<{ isDefault: boolean, workspaceIds: string[] }>}
 */
export async function assignmentsUsing(group, value) {
  const state = await readState({ fresh: true });
  const wanted = String(value).toLowerCase();
  const same = (v) => typeof v === 'string' && v.toLowerCase() === wanted;
  return {
    isDefault: same(state.defaults[group]),
    workspaceIds: Object.entries(state.workspaces).filter(([, row]) => same(row[group])).map(([id]) => id),
  };
}
