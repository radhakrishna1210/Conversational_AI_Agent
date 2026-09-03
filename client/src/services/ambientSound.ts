// client/src/services/ambientSound.ts
/**
 * Synthesized background ambience for live calls.
 *
 * Extracted from EditAgent.tsx so BOTH web-call paths can share one generator:
 * the modular pipeline (EditAgent's own AudioContext) and the bundled
 * Conversational Agent (xaiCallSocket's playbackContext). A second copy would
 * drift, and the two surfaces would stop sounding alike.
 *
 * The backend has a parallel implementation for the PHONE leg at
 * backend/src/services/voice/ambience.js — the preset TABLE below is duplicated
 * there because there is no shared package between client and backend. Keep the
 * two in sync; a test on the backend side asserts the exact preset-name set, so
 * a rename fails CI rather than silently disabling ambience for saved agents
 * (an agent stores the preset NAME, so renaming one orphans it).
 */

export type AmbientPreset = { type: BiquadFilterType; freq: number; gain: number };

// Ambient Sound (Call Configuration): synthesizes a looping background bed for
// the Web Call directly with Web Audio — no audio assets to ship. Each preset
// differs by noise colour (filter) and level. Routed to the speakers (so it's
// audible) and, when given, into the mixed call recording — never into the mic
// path, so it can't pollute what the agent's STT hears. Returns a stop().
// Declaration order IS the picker order (see AMBIENT_OPTIONS), so the quietest
// option sits next to 'None' rather than at the bottom of the list.
export const AMBIENT_PRESETS: Record<string, AmbientPreset> = {
  // Near-silent soft room tone for calm/formal use cases — present enough that
  // the line never sounds dead, quiet enough to never draw attention.
  'Quiet Room': { type: 'lowpass', freq: 300, gain: 0.004 },
  Office: { type: 'lowpass', freq: 700, gain: 0.012 },
  'Call Center': { type: 'bandpass', freq: 1100, gain: 0.014 },
  Static: { type: 'highpass', freq: 2200, gain: 0.02 },
  Cafe: { type: 'lowpass', freq: 1000, gain: 0.018 },
  Street: { type: 'lowpass', freq: 400, gain: 0.022 },
};

/**
 * Pre-rendered VOICE beds (Mode B, reports/AMBIENCE_VOICE.md): indistinct
 * chatter rendered once on the server from Fish Audio TTS and served as a
 * 24kHz WAV. Same names as backend/src/services/voice/ambience.js
 * SAMPLED_AMBIENT_PRESETS — a test there pins both lists. Two variants each;
 * the browser picks one at random so two callers rarely hear the same loop.
 */
export const SAMPLED_AMBIENT_PRESETS: Record<string, { files: string[] }> = {
  'Office Chatter': { files: ['office-chatter-1', 'office-chatter-2'] },
  'Call Center Chatter': { files: ['call-center-chatter-1', 'call-center-chatter-2'] },
};

/** Loop a pre-rendered bed. Already levelled at -48 dBFS on the server. */
const startSampledBed = (
  audioCtx: AudioContext,
  preset: string,
  mixDest?: MediaStreamAudioDestinationNode | null,
): (() => void) => {
  const cfg = SAMPLED_AMBIENT_PRESETS[preset];
  const file = cfg.files[Math.floor(Math.random() * cfg.files.length)];
  let src: AudioBufferSourceNode | null = null;
  let stopped = false;
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
    .catch((err) => console.warn('[ambient] sampled bed unavailable:', err?.message));
  return () => {
    stopped = true;
    try { src?.stop(); } catch { /* already stopped */ }
    try { gain.disconnect(); } catch { /* noop */ }
  };
};

export const startAmbientSound = (
  audioCtx: AudioContext,
  preset: string,
  mixDest?: MediaStreamAudioDestinationNode | null,
): (() => void) | null => {
  if (SAMPLED_AMBIENT_PRESETS[preset]) return startSampledBed(audioCtx, preset, mixDest);
  const cfg = AMBIENT_PRESETS[preset];
  if (!cfg) return null; // 'None' or unknown → silence
  const frames = Math.floor(audioCtx.sampleRate * 2);
  const buffer = audioCtx.createBuffer(1, frames, audioCtx.sampleRate);
  const chan = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) chan[i] = Math.random() * 2 - 1; // white noise
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = cfg.type;
  filter.frequency.value = cfg.freq;
  const gain = audioCtx.createGain();
  gain.gain.value = cfg.gain;
  src.connect(filter).connect(gain);
  gain.connect(audioCtx.destination);
  if (mixDest) gain.connect(mixDest);
  try { src.start(); } catch { /* context may be closing */ }

  // Call Center gets LAYERS on top of the bed, not discrete "sound effects":
  // a slow murmur (distant chatter) and sparse, very quiet transients
  // (keyboard ticks, an occasional faint ring) at randomized intervals so
  // nothing repeats on a noticeable cycle. All of it stays on the speaker/
  // recording path only — same as the bed, it never touches the mic/STT leg.
  const timers: number[] = [];
  let murmurStop: (() => void) | null = null;
  if (preset === 'Call Center') {
    // Distant chatter: low band-passed noise, gain slowly wandered by an LFO.
    const mSrc = audioCtx.createBufferSource();
    mSrc.buffer = buffer;
    mSrc.loop = true;
    const mFilter = audioCtx.createBiquadFilter();
    mFilter.type = 'bandpass';
    mFilter.frequency.value = 320;
    mFilter.Q.value = 1.6;
    const mGain = audioCtx.createGain();
    mGain.gain.value = 0.008;
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.13; // ~8s swell cycle
    const lfoDepth = audioCtx.createGain();
    lfoDepth.gain.value = 0.004;
    lfo.connect(lfoDepth).connect(mGain.gain);
    mSrc.connect(mFilter).connect(mGain);
    mGain.connect(audioCtx.destination);
    if (mixDest) mGain.connect(mixDest);
    try { mSrc.start(); lfo.start(); } catch { /* closing */ }
    murmurStop = () => {
      try { mSrc.stop(); lfo.stop(); } catch { /* stopped */ }
      try { mGain.disconnect(); mFilter.disconnect(); lfoDepth.disconnect(); } catch { /* noop */ }
    };

    // One very quiet transient, then reschedule itself at a random interval.
    const scheduleTransient = () => {
      const delay = 4000 + Math.random() * 9000;
      const id = window.setTimeout(() => {
        try {
          const now = audioCtx.currentTime;
          if (Math.random() < 0.85) {
            // Keyboard: 3-6 tiny high-passed noise ticks.
            const ticks = 3 + Math.floor(Math.random() * 4);
            for (let t = 0; t < ticks; t++) {
              const tick = audioCtx.createBufferSource();
              tick.buffer = buffer;
              const hp = audioCtx.createBiquadFilter();
              hp.type = 'highpass';
              hp.frequency.value = 3000;
              const g = audioCtx.createGain();
              const at = now + t * (0.09 + Math.random() * 0.07);
              g.gain.setValueAtTime(0.006, at);
              g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
              tick.connect(hp).connect(g);
              g.connect(audioCtx.destination);
              if (mixDest) g.connect(mixDest);
              tick.start(at, Math.random(), 0.035);
            }
          } else {
            // Distant phone ring: two soft, muffled bursts.
            for (let r = 0; r < 2; r++) {
              const osc = audioCtx.createOscillator();
              osc.frequency.value = 950;
              const g = audioCtx.createGain();
              const at = now + r * 0.5;
              g.gain.setValueAtTime(0.0001, at);
              g.gain.linearRampToValueAtTime(0.0035, at + 0.05);
              g.gain.linearRampToValueAtTime(0.0001, at + 0.35);
              osc.connect(g);
              g.connect(audioCtx.destination);
              if (mixDest) g.connect(mixDest);
              osc.start(at);
              osc.stop(at + 0.4);
            }
          }
        } catch { /* context closing */ }
        scheduleTransient();
      }, delay);
      timers.push(id);
    };
    scheduleTransient();
  }

  return () => {
    try { src.stop(); } catch { /* already stopped */ }
    try { gain.disconnect(); } catch { /* noop */ }
    try { filter.disconnect(); } catch { /* noop */ }
    murmurStop?.();
    timers.forEach((t) => clearTimeout(t));
  };
};

/**
 * Picker order for the Call Configuration UI. 'None' first, then the presets in
 * declaration order — one owner for the client-side list so the UI can never
 * offer a preset the generator doesn't implement (or miss one it does).
 */
export const AMBIENT_OPTIONS: string[] = ['None', ...Object.keys(AMBIENT_PRESETS), ...Object.keys(SAMPLED_AMBIENT_PRESETS)];
