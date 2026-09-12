const MAX_VARIABLES = 50;
const MAX_TRANSCRIPT_CHARS = 80_000;

const safeJson = (value, fallback) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
};

export function collectExtractionDefinitions(settingsValue) {
  const settings = safeJson(settingsValue, {}) || {};
  const configs = Array.isArray(settings.postCallConfigs) ? settings.postCallConfigs : [];
  const byKey = new Map();

  for (const config of configs) {
    if (!config || config.includeExtractedInformation === false) continue;
    const variables = Array.isArray(config.extractedVariables) ? config.extractedVariables : [];
    for (const variable of variables) {
      const key = typeof variable?.key === 'string' ? variable.key.trim().slice(0, 100) : '';
      const description = typeof variable?.description === 'string'
        ? variable.description.trim().slice(0, 1000)
        : '';
      if (!key || !description) continue;

      const existing = byKey.get(key);
      const configId = typeof config.id === 'string' ? config.id : null;
      if (existing) {
        if (configId && !existing.configIds.includes(configId)) existing.configIds.push(configId);
        continue;
      }
      if (byKey.size >= MAX_VARIABLES) break;
      byKey.set(key, {
        key,
        description,
        configIds: configId ? [configId] : [],
      });
    }
    if (byKey.size >= MAX_VARIABLES) break;
  }
  return [...byKey.values()];
}

export function transcriptToExtractionText(transcriptValue) {
  const transcript = safeJson(transcriptValue, []);
  if (!Array.isArray(transcript)) return '';

  const lines = transcript
    .filter((turn) =>
      turn &&
      (turn.role === 'user' || turn.role === 'assistant') &&
      typeof turn.content === 'string' &&
      turn.content.trim())
    .map((turn) => `${turn.role === 'user' ? 'Customer' : 'Agent'}: ${turn.content.trim().slice(0, 8000)}`);

  const full = lines.join('\n');
  if (full.length <= MAX_TRANSCRIPT_CHARS) return full;

  // Preserve both ends: introductions often contain identity/contact data,
  // while outcomes and commitments are usually near the end.
  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
  return `${full.slice(0, half)}\n[...middle omitted for model context limit...]\n${full.slice(-half)}`;
}

export function parseExtractionResponse(rawValue) {
  const text = typeof rawValue === 'string'
    ? rawValue
    : rawValue?.message ?? rawValue?.text ?? '';
  if (!text || typeof text !== 'string') throw new Error('The extraction model returned an empty response');

  const unfenced = text
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/i, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The extraction model did not return JSON');
  return JSON.parse(unfenced.slice(start, end + 1));
}

function sanitizeJsonValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim().slice(0, 4000) || null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeJsonValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [key.slice(0, 100), sanitizeJsonValue(item, depth + 1)])
    );
  }
  return null;
}

/**
 * A moment as local wall-clock time in `timeZone`, as YYYY-MM-DDThh:mm:ss.
 *
 * The same shape extraction asks the model to return for dates, and the same
 * zone Google Calendar books in — so a call fact and an extracted appointment
 * can sit side by side in one message without disagreeing by the UTC offset.
 */
export function formatLocalIso(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(' ', 'T');
}

/**
 * Variables that come from the call itself, never from the model.
 *
 * Until these existed every variable was the extraction model's reading of the
 * transcript — so a customer who answered "use the number you called me on" left
 * the phone variable empty (no digits were spoken, and the extractor is told
 * never to guess) while the number sat on the call log all along. Anything the
 * call already KNOWS should not depend on the model hearing it.
 *
 * NAMED TO STAY OUT OF THE CALENDAR'S WAY: resolveAppointmentStart() books the
 * first variable matching /(date|time|when|slot)/ when no date variable is
 * configured. "call_time" would have been booked as an appointment; "_at" and
 * "_sec" are not caught. A test pins this.
 */
export const CALL_FACT_VARIABLES = Object.freeze([
  { key: 'customer_phone', description: "The customer's phone number on this call — the number the agent dialled, or the number that called in. Empty on a web call." },
  { key: 'business_phone', description: 'Your number on this call — the caller ID the agent dialled from, or the number the customer called.' },
  { key: 'call_started_at', description: 'When the call connected, in local time.' },
  { key: 'call_ended_at', description: 'When the call ended, in local time.' },
  { key: 'call_duration_sec', description: 'How long the call lasted, in seconds.' },
]);

export const CALL_FACT_KEYS = new Set(CALL_FACT_VARIABLES.map((v) => v.key));

const blankToNull = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

/**
 * The call facts for one AgentCallLog row.
 *
 * call_started_at is derived from the END, not read off `startedAt`: an outbound
 * row is created before the phone rings, so its startedAt is when we DIALLED.
 * `durationSec` is measured from the media socket opening (callFinalizer.js), so
 * endedAt − durationSec is when the conversation actually began.
 */
export function callFactValues(row, { timeZone = 'Asia/Kolkata' } = {}) {
  const endedAt = row?.endedAt ? new Date(row.endedAt) : null;
  const ended = endedAt && !Number.isNaN(endedAt.getTime()) ? endedAt : null;
  const duration = Number.isFinite(row?.durationSec) && row.durationSec >= 0 ? row.durationSec : null;

  let startedAt = null;
  if (ended && duration != null && duration > 0) startedAt = new Date(ended.getTime() - duration * 1000);
  else if (row?.startedAt) startedAt = new Date(row.startedAt);

  return {
    customer_phone: blankToNull(row?.phoneNumber),
    business_phone: blankToNull(row?.fromNumber),
    call_started_at: startedAt ? formatLocalIso(startedAt, timeZone) : null,
    call_ended_at: ended ? formatLocalIso(ended, timeZone) : null,
    // Only once the call has ended: durationSec defaults to 0, which on a live
    // row would claim a call that lasted no time at all.
    call_duration_sec: ended ? duration : null,
  };
}

/**
 * Merge the call facts into a call's variable list. Safe to apply repeatedly.
 *
 * - A fact the agent does not define is appended, marked `builtin` — so
 *   destinations that already carry it elsewhere (the Sheet's own "Phone number"
 *   and "Duration (s)" columns) can leave it out rather than add a duplicate
 *   column to every existing customer sheet.
 * - A variable the agent DOES define under the same key keeps whatever the
 *   customer said. The call only fills it when extraction found nothing — which
 *   is precisely "keep the number you called on, unless I give you another".
 * - Anything written here earlier (`source: 'call'`) is recomputed, because the
 *   row may have gained endedAt/durationSec since the last pass.
 *
 * Returns a new array; never mutates its input.
 */
export function withCallFacts(variables, row, { timeZone } = {}) {
  const list = Array.isArray(variables) ? variables.map((v) => ({ ...v })) : [];
  if (!row) return list;
  const facts = callFactValues(row, timeZone ? { timeZone } : {});

  for (const def of CALL_FACT_VARIABLES) {
    const value = facts[def.key];
    const idx = list.findIndex((v) => String(v?.key ?? '').toLowerCase() === def.key);

    if (idx === -1) {
      list.push({ key: def.key, description: def.description, configIds: [], value, evidence: null, source: 'call', builtin: true });
      continue;
    }

    const current = list[idx];
    const isEmpty = current.value == null || String(current.value).trim() === '';
    if (current.source !== 'call' && !isEmpty) continue; // what the customer said wins
    if (current.source !== 'call' && value == null) continue; // nothing better to offer
    list[idx] = { ...current, value, evidence: null, source: 'call' };
  }
  return list;
}

export function materializeExtraction(definitions, parsed) {
  const modelVariables = parsed?.variables && typeof parsed.variables === 'object'
    ? parsed.variables
    : parsed;

  return definitions.map((definition) => {
    const candidate = modelVariables?.[definition.key];
    const wrapped = candidate && typeof candidate === 'object' && !Array.isArray(candidate) &&
      ('value' in candidate || 'evidence' in candidate);
    const value = sanitizeJsonValue(wrapped ? candidate.value : candidate);
    const evidence = wrapped && typeof candidate.evidence === 'string'
      ? candidate.evidence.trim().slice(0, 500) || null
      : null;
    return { ...definition, value, evidence };
  });
}

