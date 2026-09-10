// backend/src/services/voice/predictiveTool.js
/**
 * Predictive & Parallel Tool Execution Engine
 *
 * Traditional voice platforms wait for the user to finish speaking, send the transcript
 * to an LLM to generate a tool JSON block, execute the query, and call the LLM a second time.
 * That multi-hop roundtrip causes 2-4 seconds of dead air.
 *
 * This module extracts predictive tool intents from live/interim user speech streams
 * (e.g. "Can I check my order status? My ID is 1234...") and triggers parallel
 * asynchronous lookups in the background BEFORE the user even finishes speaking.
 */

const PREDICTIVE_PATTERNS = [
  {
    intent: 'order_status',
    regex: /\b(?:check|track|status of|where is|my)\b.*?\b(?:order|tracking|package|item)\b(?:\s+(?:number|id|#|code))?\s*[:#-]?\s*([a-zA-Z0-9_-]{3,15})\b/i,
    paramKey: 'order_id',
  },
  {
    intent: 'flight_status',
    regex: /\b(?:flight|status of|gate for)\b.*?\b([a-zA-Z0-9]{2,3}[- ]?\d{2,4})\b/i,
    paramKey: 'flight_number',
  },
  {
    intent: 'account_lookup',
    regex: /\b(?:account|customer|member)\b(?:\s+(?:id|number|#|code))?\s*[:#-]?\s*([a-zA-Z0-9_-]{4,15})\b/i,
    paramKey: 'account_id',
  },
  {
    intent: 'email_lookup',
    regex: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i,
    paramKey: 'email',
  },
];

/**
 * Extract predictive tool execution intent from an in-flight speech string.
 *
 * @param {string} text - User transcript or interim delta
 * @returns {{ matched: boolean, intent: string | null, params: Record<string, string>, confidence: number }}
 */
export function extractPredictiveIntent(text) {
  if (!text || typeof text !== 'string') {
    return { matched: false, intent: null, params: {}, confidence: 0 };
  }

  const clean = text.trim();
  for (const pattern of PREDICTIVE_PATTERNS) {
    const match = clean.match(pattern.regex);
    if (match && match[1]) {
      const val = match[1].replace(/[- ]/g, '').toUpperCase();
      return {
        matched: true,
        intent: pattern.intent,
        params: { [pattern.paramKey]: match[1].trim() },
        confidence: 0.9,
      };
    }
  }

  return { matched: false, intent: null, params: {}, confidence: 0 };
}

/**
 * Create a cache instance for parallel background queries during a call session.
 */
export function createPredictiveLookupCache() {
  const cache = new Map();

  return {
    /**
     * Start or record a predictive background query.
     * @param {string} key
     * @param {Promise<any>} promise
     */
    track(key, promise) {
      if (!key || cache.has(key)) return;
      cache.set(key, promise);
    },

    /**
     * Retrieve or wait for an in-flight predictive query.
     * @param {string} key
     * @returns {Promise<any> | null}
     */
    get(key) {
      return cache.get(key) || null;
    },

    /**
     * Clear session cache.
     */
    clear() {
      cache.clear();
    },
  };
}
