// backend/src/lib/httpKeepAlive.js
/**
 * Keeps outbound provider connections warm across turns.
 *
 * WHY THIS EXISTS — it is the single largest provider-agnostic latency win in
 * the voice pipeline, and it is invisible in every per-stage metric.
 *
 * A live call talks to three remote services per turn (STT flush, LLM, TTS) over
 * `fetch`, which Node backs with undici. Undici's default `keepAliveTimeout` is
 * FOUR SECONDS. A conversation's turn gap — the caller listening to the reply,
 * then thinking, then speaking — is routinely 5 to 30 seconds. So the pool has
 * almost always dropped the socket by the time the next turn needs it, and each
 * turn re-pays a full TCP handshake plus a TLS handshake: roughly four extra
 * round trips, to endpoints that are not in the same region as this server.
 *
 * Measured against logs/latency.log (2026-08-29, 62 turns): Fish Audio
 * documents ~300ms first audio in the `balanced` mode we already request, and
 * we measured 598ms p50. Gemini Flash-Lite streams a first token in ~400-600ms,
 * and we measured 1249ms p50. Two unrelated providers, each about 300ms over
 * their own published figure, is not two slow models — it is one shared
 * transport cost paid twice per turn.
 *
 * DELIBERATELY GLOBAL AND PROVIDER-NEUTRAL. It is installed on the default
 * dispatcher rather than per-provider, so it applies to every provider a
 * workspace can pick — including ones added later — without any of them opting
 * in, and without this file naming a single one of them. A tenant who switches
 * their agent's TTS from one provider to another keeps the benefit.
 *
 * Every value is env-tunable because the right ceiling depends on the box, not
 * on the code: `connections` bounds sockets per origin, and a server that
 * carries 45 concurrent calls wants a different number than a dev laptop.
 */

import { Agent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import logger from './logger.js';

/** Installed dispatcher, kept so tests and diagnostics can inspect it. */
let installed = null;

/**
 * Read a positive integer from the environment, falling back to `fallback`.
 * A blank or malformed value must not silently become 0 — that would mean
 * "close every socket immediately", i.e. the exact bug this file removes.
 */
const envInt = (name, fallback) => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback;
};

/**
 * Install the process-wide keep-alive dispatcher. Idempotent — calling it twice
 * replaces nothing and returns the dispatcher already in place, so a test that
 * imports the server twice does not leak agents.
 *
 * @returns {import('undici').Agent} the dispatcher now serving global `fetch`
 */
export function installKeepAliveDispatcher() {
  if (installed) return installed;

  // How long an idle socket is kept. Must comfortably exceed a conversational
  // turn gap or the whole exercise is pointless; 60s covers a caller who pauses
  // to look something up. The server still gets the final say — undici honours
  // a shorter `Keep-Alive: timeout=` from the origin, so this is a ceiling we
  // ask for, never one we impose.
  const keepAliveTimeout = envInt('HTTP_KEEPALIVE_TIMEOUT_MS', 60_000);
  // Hard cap on how far an origin may extend the above via its own header.
  // Without it, a misbehaving origin could pin sockets indefinitely.
  const keepAliveMaxTimeout = envInt('HTTP_KEEPALIVE_MAX_TIMEOUT_MS', 300_000);
  // Sockets per origin. A voice turn issues at most a couple of concurrent
  // requests per call (LLM and TTS overlap), so this is really a bulk-campaign
  // dial: 45 concurrent calls want headroom, a dev box does not.
  const connections = envInt('HTTP_POOL_CONNECTIONS', 64);

  const agent = new Agent({
    keepAliveTimeout,
    keepAliveMaxTimeout,
    connections,
    // Fail fast on a dead origin rather than hanging a live call. The per-call
    // AbortSignal.timeout() in each provider is still the real deadline; this
    // only stops a black-holed TCP connect from consuming all of it.
    connect: { timeout: envInt('HTTP_CONNECT_TIMEOUT_MS', 10_000) },
    // Pipelining is off by default in undici and stays off: a stalled response
    // at the head of a pipeline would block every request queued behind it,
    // which on this workload means one slow TTS call freezing another call's
    // LLM request on the same origin.
  });

  setGlobalDispatcher(agent);
  installed = agent;
  logger.info(
    { keepAliveTimeout, keepAliveMaxTimeout, connections },
    'HTTP keep-alive dispatcher installed for outbound provider calls',
  );
  return agent;
}

/** The dispatcher currently serving global fetch (installed or undici's own). */
export const currentDispatcher = () => installed ?? getGlobalDispatcher();

/**
 * Release pooled sockets. Only for graceful shutdown and tests — a live server
 * must never call this, since the next turn would re-handshake everything.
 */
export async function closeKeepAliveDispatcher() {
  if (!installed) return;
  const agent = installed;
  installed = null;
  await agent.close().catch(() => {});
}
