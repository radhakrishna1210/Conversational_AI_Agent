import { useEffect, useRef } from 'react';
import { voiceColor, type VoiceStateId } from '@/lib/voiceStates';

/**
 * The voice core — the figure the flagship homepage is built around.
 *
 * A ring of radial bars whose length is driven by two out-of-phase sine terms,
 * so the outline never repeats exactly; a central glow, orbiting "phoneme"
 * particles, and a pulsing core dot. Colour and amplitude both come from the
 * conversation state, so the same component reads as idle, listening, thinking
 * or speaking without any other input.
 *
 * ── Why one shared clock ──
 * The page renders FOUR of these (hero, demo telemetry, scroll narrative, the
 * stack panel). Four independent requestAnimationFrame loops would mean four
 * callbacks per frame, four visibility handlers, and four sources of drift —
 * the canvases would slowly fall out of phase with each other, which is
 * visible when two are on screen at once. Instead one module-level rAF ticks a
 * single clock and drives every registered canvas, so they stay locked
 * together and the page costs exactly one animation frame.
 */

type DrawFn = (t: number) => void;

const subscribers = new Set<DrawFn>();
let raf = 0;
let clock = 0;
let last = 0;

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function frame(now: number) {
  // Delta-timed rather than a fixed +0.016, so the figure moves at the same
  // speed on a 120 Hz display as on a 60 Hz one. Clamped because a backgrounded
  // tab can hand back a delta of several seconds, which would make the wave
  // jump rather than resume.
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
  last = now;
  clock += dt;
  subscribers.forEach((fn) => fn(clock));
  raf = requestAnimationFrame(frame);
}

function start() {
  if (raf || !subscribers.size) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function subscribe(fn: DrawFn) {
  subscribers.add(fn);
  if (prefersReduced()) {
    // Draw one static frame and leave it there.
    fn(clock);
  } else {
    start();
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) stop();
  };
}

// A hidden tab should not be painting. One handler for the whole page.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (subscribers.size && !prefersReduced()) start();
  });
}

/* ── Pointer ────────────────────────────────────────────────────────────────
   The hero's bars bulge toward the cursor. Tracked in a module ref rather than
   React state: this updates on every pointermove, and putting it through
   setState would re-render the entire page a hundred times a second to move
   something that only the canvas reads. */
const pointer = { x: 0.5, y: 0.5, active: false };
let pointerRefs = 0;
let pointerHandler: ((e: PointerEvent) => void) | null = null;

/**
 * Takes the ref OBJECT, not `ref.current`. Reading `.current` during render
 * hands the effect `null` on the first pass, and because mutating a ref never
 * re-renders, the effect would never run again with the real node — pointer
 * tracking would silently never attach.
 */
function usePointerTracking(ref: React.RefObject<HTMLCanvasElement>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    if (pointerRefs === 0) {
      pointerHandler = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        pointer.x = (e.clientX - r.left) / r.width;
        pointer.y = (e.clientY - r.top) / r.height;
        // A generous margin, so the bars start reaching before the cursor is
        // actually over the canvas.
        pointer.active =
          e.clientX >= r.left - 140 && e.clientX <= r.right + 140 &&
          e.clientY >= r.top - 140 && e.clientY <= r.bottom + 140;
      };
      window.addEventListener('pointermove', pointerHandler, { passive: true });
    }
    pointerRefs++;
    return () => {
      pointerRefs--;
      if (pointerRefs === 0 && pointerHandler) {
        window.removeEventListener('pointermove', pointerHandler);
        pointerHandler = null;
        pointer.active = false;
      }
    };
  }, [ref, enabled]);
}

/** Per-state amplitude: how hard the wave deforms. */
const AMP: Record<string, number> = {
  idle: 0.35,
  listening: 0.9,
  understanding: 0.7,
  thinking: 0.55,
  speaking: 1.15,
  acting: 0.8,
};

/** `#rrggbb` → `rgba(r,g,b,a)`. Canvas cannot resolve a CSS custom property. */
function rgba(hex: string, a: number) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawVoiceCore(
  canvas: HTMLCanvasElement,
  state: VoiceStateId,
  t: number,
  opts: { small?: boolean; pointer?: boolean } = {},
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.3;
  const col = voiceColor(state);
  const amp = AMP[state] ?? 0.7;
  const N = opts.small ? 64 : 108;

  // Central glow
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
  g.addColorStop(0, rgba(col, 0.22));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Core ring
  ctx.strokeStyle = rgba(col, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
  ctx.stroke();

  // Radial bars
  const pang = Math.atan2(pointer.y - 0.5, pointer.x - 0.5);
  const pactive = !!opts.pointer && pointer.active;

  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const v = Math.abs(0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.5) * Math.sin(t * 1.3 + i * 0.13));
    let barAmp = R * 0.16 + v * R * 0.55 * amp;

    if (pactive) {
      // Angular distance to the cursor, wrapped into [0, π].
      const d = Math.abs(((a - pang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      barAmp += Math.max(0, 1 - d / 0.7) * R * 0.5;
    }

    const r0 = R * 0.46;
    const r1 = r0 + barAmp;
    const x0 = cx + Math.cos(a) * r0;
    const y0 = cy + Math.sin(a) * r0;
    const x1 = cx + Math.cos(a) * r1;
    const y1 = cy + Math.sin(a) * r1;

    const lg = ctx.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, rgba(col, 0.15));
    lg.addColorStop(1, rgba(col, 0.9));
    ctx.strokeStyle = lg;
    ctx.lineWidth = opts.small ? 1.4 : 2.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Phoneme particles — every third one takes the violet, so the ring reads as
  // two voices rather than one.
  const PN = opts.small ? 10 : 26;
  for (let i = 0; i < PN; i++) {
    const a = t * 0.4 + i * ((Math.PI * 2) / PN);
    const rr = R * (1.3 + 0.35 * Math.sin(t * 0.9 + i));
    ctx.fillStyle = rgba(i % 3 ? col : '#818cf8', 0.5 + 0.4 * Math.sin(t + i));
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Core dot
  ctx.fillStyle = rgba(col, 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.055 * (1 + 0.3 * Math.sin(t * 3)), 0, Math.PI * 2);
  ctx.fill();
}

export default function VoiceCore({
  state,
  small,
  pointer: withPointer,
  className,
  style,
}: {
  state: VoiceStateId;
  small?: boolean;
  pointer?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  // The draw callback reads the live state through a ref, so a state change
  // does not tear down and rebuild the subscription every time the agent moves
  // from listening to thinking — which happens every ~1.1s during the demo.
  const stateRef = useRef(state);
  stateRef.current = state;

  usePointerTracking(ref, !!withPointer);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return subscribe((t) => drawVoiceCore(canvas, stateRef.current, t, { small, pointer: withPointer }));
  }, [small, withPointer]);

  // Repaint on a state change even when the clock is stopped (reduced motion),
  // otherwise the figure would keep the colour it was first drawn with.
  useEffect(() => {
    const canvas = ref.current;
    if (canvas && prefersReduced()) drawVoiceCore(canvas, state, clock, { small, pointer: withPointer });
  }, [state, small, withPointer]);

  return <canvas ref={ref} aria-hidden className={className} style={style} />;
}
