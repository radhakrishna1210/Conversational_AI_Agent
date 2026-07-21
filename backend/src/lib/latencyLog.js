// backend/src/lib/latencyLog.js
/**
 * Appends one JSON line per voice-call turn to backend/logs/latency.log so
 * per-turn latency is persisted for offline analysis instead of scrolling out
 * of the terminal. Kept deliberately separate from the main pino logger: this
 * file holds ONLY latency records, so it's trivial to tail, grep, or load into
 * a script. `*.log` is already gitignored.
 *
 * NOTE: `ttsMs` is 0 whenever the browser requested streaming TTS (streamTts) —
 * synthesis then happens on a separate endpoint and is not part of this record.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * @param {object} record - { agentId, callId?, sttProvider, llmProvider, model,
 *   sttMs, llmMs, ttsMs, totalMs }
 */
export function logTurnLatency(record) {
  try {
    getStream().write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
  } catch {
    // Logging must never break a live call — swallow any FS error.
  }
}
