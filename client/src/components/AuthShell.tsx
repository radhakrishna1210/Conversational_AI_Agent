import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * The two-panel auth layout from Spandan Auth.dc.html.
 *
 * Sign in, sign up and password reset are the same screen with a different
 * form in the right pane, so the art panel, the kicker/title/subtitle block and
 * the legal footer live here once. Previously each page reimplemented its own
 * split — Login and SignUp disagreed on panel width (45% vs 50%), on the hero
 * copy, and on which of them mentioned a "free plan".
 */

/**
 * The resonance mark: four concentric rings whose radius is modulated by two
 * out-of-phase sine terms, so the outline breathes without ever repeating
 * exactly. It is the same figure the marketing hero uses — voice drawn as a
 * standing wave rather than a stock waveform.
 *
 * Painted on a canvas rather than animated SVG because it redraws ~90 points
 * per ring per frame; as DOM nodes that is 360 path segments being restyled
 * 60 times a second.
 */
function ResonanceArt() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    let t = 0;
    let running = true;

    const draw = () => {
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

      const cx = w * 0.5;
      const cy = h * 0.5;
      const base = Math.min(w, h) * 0.24;

      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        const rr = base * (0.7 + k * 0.26);
        const steps = 90;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const wob =
            Math.sin(a * 5 + t * 1.1 + k) * base * 0.12 +
            Math.sin(a * 8 - t * 0.7 + k) * base * 0.05;
          const r = rr + wob;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        // Alternating cyan/violet — the two ends of the voice spectrum.
        const hue = k % 2 ? 265 : 190;
        ctx.strokeStyle = `hsla(${hue}, 85%, 64%, ${0.32 - k * 0.05})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, base);
      g.addColorStop(0, 'rgba(14,179,158,.5)');
      g.addColorStop(1, 'rgba(14,179,158,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.4 + 0.25 * Math.sin(t * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, base * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (!running) return;
      t += 0.016;
      draw();
      raf = requestAnimationFrame(loop);
    };

    // Reduced motion still gets the figure — it just stops moving.
    if (reduced) draw();
    else loop();

    // A background tab burning a rAF loop on a decorative canvas is pure waste.
    const onVisibility = () => {
      running = !document.hidden && !reduced;
      if (running) loop();
      else cancelAnimationFrame(raf);
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => draw();
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.9, display: 'block' }}
    />
  );
}

export default function AuthShell({
  kicker,
  title,
  subtitle,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="sp-auth">
      {/* ── Art side ── */}
      <div className="sp-auth-art">
        <ResonanceArt />

        <Link
          to="/"
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, color: 'var(--tx)', textDecoration: 'none' }}
        >
          <span style={{ position: 'relative', width: 26, height: 26, display: 'grid', placeItems: 'center' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid var(--cyan)', opacity: 0.85 }} />
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 12px var(--cyan)' }} />
          </span>
          <span style={{ fontFamily: 'var(--ff-d)', fontWeight: 700, fontSize: 19 }}>Spandan</span>
        </Link>

        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: 'var(--ff-d)',
              fontWeight: 700,
              fontSize: 'clamp(26px, 3vw, 38px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'var(--tx)',
            }}
          >
            Voice AI that calls,<br />listens, and acts<br />like a person.
          </div>
          <div className="rz-mono" style={{ fontSize: 12, marginTop: 16 }}>
            स्पंदन · the pulse of a conversation
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', gap: 20, flexWrap: 'wrap' }} className="rz-mono">
          <span>sub-500ms first token</span>
          <span>50+ languages</span>
          <span>SOC 2</span>
        </div>
      </div>

      {/* ── Form side ── */}
      <div className="sp-auth-form">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div className="rz-eyebrow">{kicker}</div>
          <h1 className="rz-h1" style={{ fontSize: 28, margin: '8px 0 4px' }}>{title}</h1>
          <p className="rz-sub" style={{ margin: '0 0 22px', fontSize: 14 }}>{subtitle}</p>

          {children}

          {footer}

          <div className="rz-mono-xs" style={{ marginTop: 28, textAlign: 'center', lineHeight: 1.7 }}>
            By continuing you agree to the Terms and Privacy Policy.<br />
            Protected by SOC 2 · SSO available on request.
          </div>
        </div>
      </div>

      <style>{`
        .sp-auth {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .sp-auth-art {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 40px;
          border-right: 1px solid var(--line);
          background:
            radial-gradient(120% 100% at 30% 20%, rgba(14,179,158,.10), transparent 55%),
            radial-gradient(100% 100% at 80% 90%, rgba(129,140,248,.10), transparent 55%),
            var(--bg-2);
        }
        .sp-auth-form {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          background: var(--bg);
        }

        /* Below 900px the art panel would take half the width and leave the
           form in a column too narrow to type a password into, so it drops out
           entirely rather than shrinking to a stripe. */
        @media (max-width: 900px) {
          .sp-auth { grid-template-columns: 1fr; }
          .sp-auth-art { display: none; }
        }
      `}</style>
    </div>
  );
}

/** Google button + "or" rule. Shared by sign-in and sign-up. */
export function AuthOAuth({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="rz-btn rz-btn-block"
        style={{
          background: 'var(--s1)',
          border: '1px solid var(--line-2)',
          color: 'var(--tx)',
          fontSize: 14,
          padding: 12,
          borderRadius: 11,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {label}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span className="rz-mono">or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
    </>
  );
}

/** Mono-labelled field, the auth screen's only input shape. */
export function AuthField({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div className="rz-between" style={{ marginBottom: 6 }}>
        <span className="rz-label">{label}</span>
        {action}
      </div>
      {children}
    </label>
  );
}
