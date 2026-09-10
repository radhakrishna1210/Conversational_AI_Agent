// backend/src/services/voice/callResumptionCache.js
/**
 * Multi-Turn State Preservation & Call Resumption Cache
 *
 * Caches live dialogue state, extracted entities, and session variables in a
 * 2-minute (120s) TTL store keyed by caller phone number (Caller-ID).
 * If a cell call drops and the user calls back within 120s, context is resumed immediately.
 */

export function createCallResumptionCache(options = {}) {
  const ttlMs = options.ttlMs || 120000; // 2 minutes default
  const store = new Map();

  function sanitizeCallerId(callerId) {
    return String(callerId || '').replace(/[^\d+]/g, '').trim();
  }

  function saveSession(callerId, sessionState) {
    const key = sanitizeCallerId(callerId);
    if (!key) return;

    store.set(key, {
      state: { ...sessionState },
      savedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  function retrieveSession(callerId) {
    const key = sanitizeCallerId(callerId);
    if (!key) return null;

    const entry = store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }

    // Found active recent dropped call session
    return {
      isResumed: true,
      secondsSinceDisconnect: Math.round((Date.now() - entry.savedAt) / 1000),
      sessionState: entry.state,
      resumptionGreeting: "Welcome back! It looks like we were briefly disconnected. Let's continue right where we left off.",
    };
  }

  function clearSession(callerId) {
    const key = sanitizeCallerId(callerId);
    if (key) store.delete(key);
  }

  function pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.expiresAt) {
        store.delete(key);
      }
    }
  }

  return {
    saveSession,
    retrieveSession,
    clearSession,
    pruneExpired,
    size: () => store.size,
  };
}
