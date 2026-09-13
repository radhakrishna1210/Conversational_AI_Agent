// backend/src/services/llmPressure.js
/**
 * Is the LLM quota being hit right now?
 *
 * One process-wide signal, set whenever a provider answers "rate limited" (429,
 * RESOURCE_EXHAUSTED), and read by the things that spend LLM requests nobody on
 * a live line is waiting for:
 *
 *   - interim speculation, which can start several requests per turn
 *     (voice/speculativeTurn.js);
 *   - the slow-first-token hedge, which sends a second copy of a request
 *     (voiceTurnStream in agentRuntime.service.js);
 *   - post-call extraction, which can run a minute later without anyone
 *     noticing (ws/callFinalizer.js).
 *
 * WHY A SIGNAL, NOT A CAMPAIGN FLAG. The limit is a per-model requests-per-minute
 * quota shared by every call in this process — free-tier Gemini is 15 per model.
 * A bulk campaign exhausts it because several calls are live at once, but so
 * would a busy inbound hour, and a test call placed during a campaign is caught
 * in it too. What matters is whether the quota is being hit, not where the
 * traffic came from. On a paid tier nothing ever sets this, and all three keep
 * their full latency benefit.
 */

import logger from '../lib/logger.js';

/** How long one rate-limit answer keeps the pressure on. Google's window is a minute. */
const COOLDOWN_MS = Math.max(1_000, Number(process.env.LLM_PRESSURE_COOLDOWN_MS) || 60_000);

/** Post-call work never waits longer than this; after it, it runs regardless. */
const DEFER_MAX_MS = Math.max(0, Number(process.env.POSTCALL_LLM_DEFER_MAX_MS) || 3 * 60_000);

/**
 * How long one deferred job may hold the line before the next one starts anyway.
 * An extraction is one request of a few seconds; a request that never returns
 * must not park every later call's post-call delivery behind it.
 */
const DEFER_STEP_CAP_MS = 20_000;

let lastLimitedAt = 0;
let deferredLine = Promise.resolve();

const defaultSleep = (ms) => new Promise((resolve) => {
  const t = setTimeout(resolve, Math.max(0, ms));
  t.unref?.();
});

export function isLlmUnderPressure(now = Date.now()) {
  return lastLimitedAt > 0 && now - lastLimitedAt < COOLDOWN_MS;
}

/** A provider just said "rate limited". Logged once per pressure episode, not per request. */
export function noteLlmRateLimited(source = 'LLM', now = Date.now()) {
  const already = isLlmUnderPressure(now);
  lastLimitedAt = now;
  if (!already) {
    logger.warn(
      `${source} hit the LLM rate limit — pausing interim speculation, hedged requests and `
      + `post-call extraction for ${Math.round(COOLDOWN_MS / 1000)}s so live calls keep the quota`,
    );
  }
}

/**
 * Run `fn` now, or — while the quota is being hit — after the pressure clears.
 *
 * Deferred jobs run ONE AT A TIME. When a campaign's calls end together their
 * extractions would otherwise all fire the moment the pressure lifts, which is
 * exactly the burst that brings it back.
 *
 * @template T
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
export function deferWhileLlmPressured(fn, {
  maxWaitMs = DEFER_MAX_MS,
  pollMs = 5_000,
  sleep = defaultSleep,
  now = Date.now,
  stepCap = () => defaultSleep(DEFER_STEP_CAP_MS),
} = {}) {
  if (!isLlmUnderPressure(now())) return Promise.resolve().then(fn);

  const ahead = deferredLine;
  let releaseLine;
  deferredLine = new Promise((resolve) => { releaseLine = resolve; });

  return (async () => {
    try {
      await ahead;
      const deadline = now() + maxWaitMs;
      while (isLlmUnderPressure(now()) && now() < deadline) {
        await sleep(Math.min(pollMs, deadline - now()));
      }
    } catch {
      /* the line ahead never rejects; waiting is best effort either way */
    }
    const job = Promise.resolve().then(fn);
    Promise.race([job.catch(() => {}), stepCap()]).then(releaseLine);
    return job;
  })();
}

/** Tests only. */
export function __resetLlmPressureForTests() {
  lastLimitedAt = 0;
  deferredLine = Promise.resolve();
}

export const LLM_PRESSURE_COOLDOWN_MS = COOLDOWN_MS;
