// backend/src/ws/turnTiming.js
/**
 * Validation for the browser's `turn-timing` frame.
 *
 * The server's latency record stops at its own socket: `ttfaMs` is when TTS
 * handed over a byte, not when a person heard anything. The only place "the
 * caller can hear the reply" is knowable is the browser's <audio> 'playing'
 * event, so the client measures that against its own end-of-speech and posts
 * the result back. This frame is the one channel where a caller-controlled
 * number lands in a metrics file, hence the strictness: every field is
 * clamped to a plausible range and anything malformed is dropped whole.
 *
 * Pure, so it is testable without a socket.
 */

const MAX_MS = 120_000; // 2 minutes — nothing inside one turn is longer

const ms = (v) => {
  // Number(null) is 0 and Number(true) is 1: a missing field must stay missing,
  // not become a zero-millisecond measurement.
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MS) return null;
  return Math.round(n);
};

const TURN_ID = /^[A-Za-z0-9-]{1,16}:[0-9]{1,6}$/;

/**
 * @param {unknown} msg parsed JSON frame from the client
 * @returns {null | {
 *   turnId: string,
 *   speechEndToAudibleMs: number|null,
 *   endTurnToAudibleMs: number|null,
 *   clientEndpointMs: number|null,
 *   perceivedMs: number|null,
 *   filler: boolean,
 * }} null when the frame is not usable
 */
export function parseTurnTiming(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const turnId = typeof msg.turnId === 'string' && TURN_ID.test(msg.turnId) ? msg.turnId : null;
  if (!turnId) return null;
  const speechEndToAudibleMs = ms(msg.speechEndToAudibleMs);
  const endTurnToAudibleMs = ms(msg.endTurnToAudibleMs);
  const clientEndpointMs = ms(msg.clientEndpointMs);
  // end-of-speech -> the cached ack clip, when one played. Perceived, not actual.
  const perceivedMs = ms(msg.perceivedMs);
  // A frame that carries no usable measurement at all is noise, not a record.
  if (speechEndToAudibleMs == null && endTurnToAudibleMs == null) return null;
  return {
    turnId,
    speechEndToAudibleMs,
    endTurnToAudibleMs,
    clientEndpointMs,
    perceivedMs,
    filler: msg.filler === true,
  };
}
