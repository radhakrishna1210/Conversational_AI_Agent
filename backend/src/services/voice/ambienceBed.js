// backend/src/services/voice/ambienceBed.js
/**
 * The browser's copy of a synthesized ambience bed, as a 24kHz WAV.
 *
 * ── Why this is its own file ────────────────────────────────────────────────
 *
 * It is three lines of real work and it cannot live in ambience.js. encodeWav()
 * is in callRecorder.js, which imports telephonyAudio.js, which imports
 * encodeUlaw / ULAW_FRAME_BYTES back out of ambience.js. Adding the import
 * there closes the cycle, and Node does not warn about it — it fails the entire
 * module graph with `Cannot access 'ULAW_FRAME_BYTES' before initialization`
 * from a file nobody was editing. So the renderer stays a leaf and the encoding
 * sits above it, here.
 *
 * ── What it is for ──────────────────────────────────────────────────────────
 *
 * The browser used to synthesize its own bed in Web Audio from a duplicated
 * preset table, and the levels the two transports produced were never equal —
 * a 23dB spread across the presets, Office 10dB below the phone and inaudible.
 * Serving the rendered loop means the web-call tester plays exactly what a
 * phone caller hears. See the long note above BROWSER_BED_RATE in ambience.js.
 */

import { renderAmbienceLoop, presetForSlug, BROWSER_BED_RATE } from './ambience.js';
import { encodeWav } from './callRecorder.js';

/** slug -> encoded WAV. Bounded by the preset table, so it cannot grow. */
const cache = new Map();

/**
 * @param {string} slug from the request path, e.g. "call-center"
 * @returns {Buffer|null} null when the slug is not a synthesized preset — the
 *   caller should then look for a pre-rendered asset on disk.
 *
 * Rendered on demand and cached as ENCODED BYTES, not just as the loop:
 * renderAmbienceLoop already caches the samples, but a 24s 24kHz loop is ~1.1MB
 * and re-encoding it per request would allocate that on every web call. Costs
 * 67-170ms once per preset per process.
 */
export function synthesizedBedWav(slug) {
  const preset = presetForSlug(slug);
  if (!preset) return null;
  const hit = cache.get(slug);
  if (hit) return hit;
  const loop = renderAmbienceLoop(preset, { sampleRate: BROWSER_BED_RATE });
  if (!loop) return null;
  const wav = encodeWav(loop, BROWSER_BED_RATE);
  cache.set(slug, wav);
  return wav;
}
