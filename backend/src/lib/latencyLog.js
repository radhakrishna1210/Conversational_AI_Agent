// backend/src/lib/latencyLog.js
/**
 * Appends one JSON line per voice-call turn to backend/logs/latency.log so
 * per-turn latency is persisted for offline analysis instead of scrolling out
 * of the terminal. Kept deliberately separate from the main pino logger: this
 * file holds ONLY latency records, so it's trivial to tail, grep, or load into
 * a script. `*.log` is already gitignored.
 *
 * Record kinds, joined by `turnId` (scripts/latency-report.mjs does the join):
 *   - (no kind)  the pipeline record from voiceTurnStream — end-of-speech →
 *                first TTS byte at the server (`ttfaMs`), plus every stage.
 *   - 'wire'     phone bridge: end-of-speech → first frame written to the
 *                carrier socket (`wireMs`), plus pacer queue depth. This is the
 *                number that separates "slow model" from "deep buffer".
 *   - 'audible'  web client: end-of-speech → the browser's <audio> 'playing'
 *                event. The only record that measures what a person heard.
 *
 * Every record also carries the event-loop delay percentiles accumulated since
 * the previous record (`elLag*`), so a slow turn can be told apart from a
 * starved process.
 *
 * NOTE: `ttsMs` is 0 whenever the browser requested streaming TTS (streamTts) —
 * synthesis then happens on a separate endpoint and is not part of this record.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { snapshotEventLoopLag, startEventLoopLagMonitor } from './eventLoopLag.js';

const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'latency.log');

let stream = null;
const getStream = () => {
  if (!stream) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  }
  return stream;
};

/**
 * The line that gets written, minus the write. Pure apart from the clock and
 * the lag snapshot, so the shape is unit-testable.
 *
 * @param {object} record
 * @param {{ now?: () => Date, lag?: () => object }} [deps] test seams
 */
export function buildLatencyRecord(record, { now = () => new Date(), lag = snapshotEventLoopLag } = {}) {
  return { ts: now().toISOString(), ...record, ...lag() };
}

/**
 * @param {object} record - { turnId?, kind?, agentId, callId?, channel, ... }
 */
export function logTurnLatency(record) {
  try {
    startEventLoopLagMonitor();
    getStream().write(`${JSON.stringify(buildLatencyRecord(record))}\n`);
  } catch {
    // Logging must never break a live call — swallow any FS error.
  }
}
