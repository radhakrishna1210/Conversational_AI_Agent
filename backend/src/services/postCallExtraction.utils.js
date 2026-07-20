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

