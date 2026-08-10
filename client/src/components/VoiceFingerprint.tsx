import { useEffect, useRef } from 'react';
import { voiceState, type VoiceStateId } from '@/lib/voiceStates';

/**
 * The signature component of the Spandan system: a generative "voice
 * fingerprint" that renders what the agent is doing as living colour.
 *
 * Three concentric rings are deformed by two out-of-phase sine terms and
 * redrawn each frame, over a radial glow whose hue comes from the active
 * conversation state. The effect is a waveform that reads as breathing when
 * idle and agitated when speaking, without ever showing a fake audio level —
 * design principle 04, honest metrics only. Pass a real amplitude via `level`
 * when one is available (mic input, TTS output); it multiplies the state's
 * baseline rather than replacing it, so the state remains legible either way.
 *
 * Everything is drawn to a single canvas rather than animated in the DOM
 * because this can be on screen alongside a live call — a 60fps rAF loop
 * touching one bitmap costs far less than compositing dozens of animated nodes.
 */

interface VoiceFingerprintProps {
  state?: VoiceStateId;
  /** Optional real signal level, 0–1. Multiplies the state's baseline amplitude. */
  level?: number;
  /** Rendered bottom-left over the canvas. Off by default so the component stays composable. */
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function VoiceFingerprint({
  state = 'idle',
  level,
  showLabel = false,
  className,
  style,
}: VoiceFingerprintProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /*
    The loop reads the current state through a ref rather than closing over the
    prop. Restarting rAF on every state change would drop the accumulated `t`
    and make the waveform jump; this way a state change is a smooth hue and
    amplitude shift over a continuous timeline.
  */
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  stateRef.current = state;
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    let raf = 0;
    let running = true;
    let t = 0;

    const draw = () => {
      const def = voiceState(stateRef.current);
      const { hue } = def;
      // A supplied level scales the state baseline; absent one, the baseline stands alone.
      const amp = def.amp * (levelRef.current == null ? 1 : 0.35 + levelRef.current * 0.9);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.3;

      // Ambient glow behind the rings.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2);
      g.addColorStop(0, `hsla(${hue},85%,62%,.18)`);
      g.addColorStop(1, `hsla(${hue},85%,62%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 2, 0, Math.PI * 2);
      ctx.fill();

      // Three deformed rings; alternating ones pick up a complementary hue so
      // the fingerprint reads as two interfering voices rather than one ripple.
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        const rr = base * (0.7 + k * 0.22);
        const steps = 88;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const wob =
            Math.sin(a * 5 + t * 1.4 + k * 1.1) * base * 0.14 * amp +
            Math.sin(a * 7 - t + k) * base * 0.06 * amp;
          const r = rr + wob;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle =
          k % 2
            ? `hsla(${(hue + 60) % 360},80%,66%,${0.5 - k * 0.12})`
            : `hsla(${hue},85%,64%,${0.7 - k * 0.15})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Pulsing core.
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.5);
      cg.addColorStop(0, `hsl(${hue},85%,62%)`);
      cg.addColorStop(1, `hsla(${hue},85%,62%,0)`);
      ctx.fillStyle = cg;
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.5 + 0.4 * Math.sin(t * 3) * amp));
      ctx.beginPath();
      ctx.arc(cx, cy, base * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (!running) return;
      t += 0.016;
      draw();
      raf = requestAnimationFrame(loop);
    };

    if (reduced) {
      // Still render one frame so the shape and its colour are present.
      draw();
    } else {
      loop();
    }

    // A backgrounded tab keeps its rAF alive in some browsers; a hidden call
    // screen should not keep burning frames.
    const onVisibility = () => {
      if (reduced) return;
      const shouldRun = !document.hidden;
      if (shouldRun === running) return;
      running = shouldRun;
      if (running) loop();
      else cancelAnimationFrame(raf);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Re-render on resize so the bitmap tracks a fluid container.
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw()) : null;
    ro?.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      ro?.disconnect();
    };
  }, []);

  const def = voiceState(state);

  return (
    <div
      className={className}
      style={{ position: 'relative', ...style }}
      role="img"
      aria-label={`Agent state: ${def.label} — ${def.desc}`}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            left: 14,
            bottom: 12,
            fontFamily: 'var(--ff-d)',
            fontWeight: 700,
            fontSize: 20,
            color: def.color,
          }}
        >
          {def.label}
        </div>
      )}
    </div>
  );
}
