// client/src/services/ambientSound.ts
/**
 * Background ambience for live calls.
 *
 * Used by BOTH web-call paths — the modular pipeline (EditAgent's own
 * AudioContext) and the bundled Conversational Agent (xaiCallSocket's
 * playbackContext) — so the two surfaces cannot drift apart.
 *
 * ── This module no longer synthesizes anything ──────────────────────────────
 *
 * It used to build every bed here in Web Audio: white noise through a
 * BiquadFilterNode at a hardcoded per-preset `gain`, from a preset table
 * duplicated out of backend/src/services/voice/ambience.js.
 *
 * Those gain constants WERE the level, and nothing measured them. How loud a
 * preset actually came out depended on how much energy its filter happened to
 * pass at the browser's own sample rate — a lowpass at 700Hz keeps ~18% of the
 * spectrum at the 8kHz line rate and ~3% at a 48kHz AudioContext. Measured
 * across the six presets the browser produced:
 *
 *   Quiet Room -71.2 dBFS   Office -58.1   Street -55.2
 *   Cafe       -53.0        Call Center -52.2   Static -39.2
 *
 * against a phone leg that normalises every one of them to the same level. A
 * 23dB spread nobody chose, Office 10dB below the phone and inaudible, Static
 * 9dB above it. Reported from a live test as "only Street was coming through,
 * and too quiet" — which is exactly what those numbers predict.
 *
 * So the browser now PLAYS the bed the backend renders, over
 * `GET /api/v1/ambience/bed/<file>.24k.wav`, for synthesized presets and
 * pre-rendered chatter beds alike. One implementation of level, layers and loop
 * length instead of two that were never equal, and the web call finally sounds
 * like the phone call it is there to preview.
 *
 * What stays here is the preset NAME list, which must match
 * backend/src/services/voice/ambience.js — a test on that side pins the exact
 * set, so a rename fails CI instead of silently orphaning saved agents (an
 * agent stores the preset NAME, not its parameters).
 *
 * Everything is routed to the speakers and, when given, the mixed call
 * recording — never into the mic path, so a bed can never reach the agent's
 * own STT.
 */

/**
 * Synthesized presets, in picker order — the quietest sits next to 'None'
 * rather than at the bottom of the list. Names only: the filter and level that
 * used to live here are the backend's, and duplicating them is what produced
 * the mismatch described above.
 */
export const AMBIENT_PRESETS = ['Quiet Room', 'Office', 'Call Center', 'Static', 'Cafe', 'Street'] as const;

/**
 * Pre-rendered VOICE beds (Mode B, reports/AMBIENCE_VOICE.md): indistinct
 * chatter rendered once on the server from Fish Audio TTS. Two variants each,
 * so two concurrent callers rarely hear the same loop.
 */
export const SAMPLED_AMBIENT_PRESETS: Record<string, { files: string[] }> = {
  'Office Chatter': { files: ['office-chatter-1', 'office-chatter-2'] },
  'Call Center Chatter': { files: ['call-center-chatter-1', 'call-center-chatter-2'] },
};

/** "Call Center" -> "call-center". Mirrors bedSlug() in the backend module. */
const bedSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Which bed file(s) a preset can play, or null for 'None'/unknown. */
const bedFilesFor = (preset: string): string[] | null => {
  const sampled = SAMPLED_AMBIENT_PRESETS[preset];
  if (sampled) return sampled.files;
  return (AMBIENT_PRESETS as readonly string[]).includes(preset) ? [bedSlug(preset)] : null;
};

export const startAmbientSound = (
  audioCtx: AudioContext,
  preset: string,
  mixDest?: MediaStreamAudioDestinationNode | null,
): (() => void) | null => {
  const files = bedFilesFor(preset);
  if (!files) return null; // 'None' or unknown → silence

  const file = files[Math.floor(Math.random() * files.length)];
  let src: AudioBufferSourceNode | null = null;
  let stopped = false;

  // Levelled on the server, so this is a plain pass-through. It exists at all
  // so there is one node to disconnect on stop, and one place to attach the
  // recording mix.
  const gain = audioCtx.createGain();
  gain.gain.value = 1;
  gain.connect(audioCtx.destination);
  if (mixDest) gain.connect(mixDest);

  fetch(`/api/v1/ambience/bed/${file}.24k.wav`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`bed ${r.status}`))))
    .then((buf) => audioCtx.decodeAudioData(buf))
    .then((decoded) => {
      if (stopped) return;
      src = audioCtx.createBufferSource();
      src.buffer = decoded;
      src.loop = true;
      src.connect(gain);
      try { src.start(); } catch { /* context may be closing */ }
    })
    // A bed that cannot be fetched leaves the call silent rather than failing
    // it. That was already the behaviour for the chatter beds; it now covers
    // every preset, which is the one thing lost by not synthesizing locally.
    .catch((err) => console.warn('[ambient] bed unavailable:', err?.message));

  return () => {
    stopped = true;
    try { src?.stop(); } catch { /* already stopped */ }
    try { gain.disconnect(); } catch { /* noop */ }
  };
};

/**
 * Picker order for the Call Configuration UI. 'None' first, then the
 * synthesized presets, then the chatter beds — one owner for the client-side
 * list so the UI can never offer a preset that has no bed behind it.
 */
export const AMBIENT_OPTIONS: string[] = ['None', ...AMBIENT_PRESETS, ...Object.keys(SAMPLED_AMBIENT_PRESETS)];
