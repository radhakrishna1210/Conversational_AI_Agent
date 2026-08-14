// backend/src/ws/socketHeartbeat.js
/**
 * Liveness for the browser-facing call sockets.
 *
 * A tab that is CLOSED sends a close frame and everything downstream — session
 * teardown, the closed-tab billing backstop — runs promptly. A tab that CRASHES,
 * loses its network, or goes to sleep sends nothing at all, and TCP will not
 * notice for as long as two hours on a default Linux keepalive. To this process
 * the call simply never ends: the Deepgram session stays open, the call log sits
 * IN_PROGRESS, and the backstop that exists to bill an abandoned call never
 * fires because 'close' never fires.
 *
 * WebSocket ping/pong is the fix, and it has to be the PROTOCOL-level ping
 * rather than an application message: it is answered by the browser's WebSocket
 * implementation itself, so it still gets a reply from a page whose JavaScript
 * is wedged, and it needs no client-side code at all.
 *
 * Deliberately slow. This is not latency-sensitive — it exists to notice a
 * corpse, not to measure the connection — and every ping is a wakeup on a
 * device that may be a phone on battery.
 */

import logger from '../lib/logger.js';

/** Ping every 30s; two unanswered rounds (~60s) is dead. */
const DEFAULT_INTERVAL_MS = Number(process.env.WS_HEARTBEAT_MS) || 30_000;

/**
 * @param {import('ws').WebSocket} ws
 * @param {object} [opts]
 * @param {number} [opts.intervalMs]
 * @param {string} [opts.label]  names the socket in the log line
 * @returns {() => void} stop — call it from the socket's cleanup
 */
export function startHeartbeat(ws, { intervalMs = DEFAULT_INTERVAL_MS, label = 'web call' } = {}) {
  let awaitingPong = false;

  const onPong = () => { awaitingPong = false; };
  ws.on('pong', onPong);

  const timer = setInterval(() => {
    if (awaitingPong) {
      // Two rounds with no answer. terminate() rather than close(): a close
      // handshake waits for a reply from a peer that has already proven it is
      // not answering. This fires the socket's 'close' event, so the normal
      // teardown path — including the billing backstop — runs from here.
      logger.info({ label }, 'Call socket stopped answering pings — terminating it as abandoned');
      try { ws.terminate(); } catch { /* already gone */ }
      return;
    }
    awaitingPong = true;
    try { ws.ping(); } catch { /* socket closing; the close handler tidies up */ }
  }, intervalMs);
  // Never a reason to hold the process open at shutdown.
  timer.unref?.();

  return () => {
    clearInterval(timer);
    ws.off?.('pong', onPong);
  };
}
