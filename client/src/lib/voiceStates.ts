/**
 * The six conversation states — the heart of the Spandan "Resonance" system.
 *
 * Design principle 01: voice is the hero, and colour is never decorative. Every
 * accent in the palette names something the agent is actually doing right now,
 * so this module is the single source of truth for that mapping. Surfaces that
 * show agent activity (VoiceFingerprint, dashboard status dots, call
 * transcripts, the agent builder preview) all read from here rather than
 * hardcoding a hex, which is what keeps one agent's "thinking" violet identical
 * to another's.
 *
 * `hue` drives the generative canvas in VoiceFingerprint: the fingerprint is
 * drawn in HSL so a state change animates as a hue rotation rather than a hard
 * colour swap. `amp` scales how violently the waveform deforms — idle barely
 * breathes, speaking pushes hardest.
 */

export type VoiceStateId =
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'thinking'
  | 'speaking'
  | 'acting';

export interface VoiceStateDef {
  id: VoiceStateId;
  label: string;
  /** Shown under the label in the design-system view and in tooltips. */
  desc: string;
  /** Literal hex. Canvas draws to a bitmap, so it cannot resolve a CSS var. */
  color: string;
  /** The CSS custom property carrying the same colour, for DOM styling. */
  token: string;
  /** HSL hue for the generative fingerprint. */
  hue: number;
  /** Waveform deformation multiplier. */
  amp: number;
}

export const VOICE_STATES: readonly VoiceStateDef[] = [
  {
    id: 'idle',
    label: 'Idle',
    desc: 'Waiting for a caller',
    color: '#6b829e',
    token: '--tx-3',
    hue: 210,
    amp: 0.4,
  },
  {
    id: 'listening',
    label: 'Listening',
    desc: 'Caller is speaking',
    color: '#0eb39e',
    token: '--cyan',
    hue: 168,
    amp: 1,
  },
  {
    id: 'understanding',
    label: 'Understanding',
    desc: 'Parsing intent',
    color: '#5cd6c6',
    token: '--cyan-2',
    hue: 175,
    amp: 0.8,
  },
  {
    id: 'thinking',
    label: 'Thinking',
    desc: 'Reasoning + retrieving',
    color: '#818cf8',
    token: '--violet',
    hue: 255,
    amp: 0.6,
  },
  {
    id: 'speaking',
    label: 'Speaking',
    desc: 'Generating the reply',
    color: '#f97316',
    token: '--coral',
    hue: 18,
    amp: 1.25,
  },
  {
    id: 'acting',
    label: 'Acting',
    desc: 'Firing a tool',
    color: '#34d399',
    token: '--lime',
    hue: 155,
    amp: 0.95,
  },
] as const;

const BY_ID = new Map<VoiceStateId, VoiceStateDef>(
  VOICE_STATES.map((s) => [s.id, s]),
);

/** Falls back to `idle` so an unknown state from the backend renders calm rather than blank. */
export function voiceState(id: VoiceStateId | string | null | undefined): VoiceStateDef {
  return BY_ID.get(id as VoiceStateId) ?? BY_ID.get('idle')!;
}

export const voiceColor = (id: VoiceStateId | string | null | undefined) => voiceState(id).color;
