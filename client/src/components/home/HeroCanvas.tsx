import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  createHeroFrameSource,
  type FramePalette,
  type FrameSource,
} from '@/lib/motion/frameSource';

/* ═══════════════════════════════════════════════════════════════════════════
   The hero's scroll-scrubbed canvas.

   This component owns the canvas, its device-pixel sizing, its palette and its
   preload gate. It does NOT own the scroll — Home creates the pinned
   ScrollTrigger and calls draw(progress) from its onUpdate, because the pin and
   the copy animations have to share one timeline with the canvas or they drift
   apart.

   Paint is throttled to one rAF per frame. ScrollTrigger's onUpdate can fire
   more than once per frame during a fast flick, and a canvas repaint is the
   most expensive thing on this page.
   ══════════════════════════════════════════════════════════════════════════ */

export interface HeroCanvasHandle {
  /** Paint the frame at `progress` (0 → 1). Cheap to over-call. */
  draw: (progress: number) => void;
}

interface Props {
  /** Fires once the source can scrub without stalling. Home holds the pin
   *  creation until this resolves, so the first scroll is never janky. */
  onReady?: () => void;
}

/** Reads the landing page's colour legend off the DOM so the canvas cannot
 *  drift from the CSS. Falls back to the dark-theme literals if the custom
 *  properties are missing (e.g. the canvas mounts before Home.css applies). */
function readPalette(host: HTMLElement): FramePalette {
  const style = getComputedStyle(host);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    agent: read('--lp-live', '#0eb39e'),
    caller: read('--lp-caller', '#8aa9cc'),
    money: read('--lp-meter', '#f5a524'),
    dim: read('--border', 'rgba(148,163,184,0.28)'),
  };
}

const HeroCanvas = forwardRef<HeroCanvasHandle, Props>(function HeroCanvas({ onReady }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<FrameSource | null>(null);
  const paletteRef = useRef<FramePalette | null>(null);

  /** Last progress handed to us, so resize and theme change can repaint the
   *  same frame instead of snapping back to 0. */
  const progressRef = useRef(0);
  const frameRef = useRef(0);
  const readyRef = useRef(false);

  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);

  /** Paints immediately — used by the rAF throttle, by resize and by theme
   *  changes. Reads its inputs from refs so it never needs to be re-created. */
  const paint = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    const palette = paletteRef.current;
    if (!canvas || !source || !palette) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    source.draw(ctx, progressRef.current, {
      width,
      height,
      narrow: width < 940,
      palette,
    });
  }, []);

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(paint);
  }, [paint]);

  useImperativeHandle(
    ref,
    () => ({
      draw: (progress: number) => {
        progressRef.current = progress;
        if (readyRef.current) schedule();
      },
    }),
    [schedule],
  );

  /* Size the backing store to device pixels, capped at 2×. Above 2× the extra
     pixels are invisible and the fill cost is real — a 3× phone would be
     painting nine times the area of a CSS pixel for no visible gain. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        // setTransform rather than scale: this runs on every resize, and scale
        // compounds where setTransform replaces.
        canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      paint();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [paint]);

  /* Palette, and keeping it current. The app toggles themes by swapping a
     class on <html>, which changes --lp-caller and --lp-meter; without this
     the canvas would keep painting dark-theme colours on a light page. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sync = () => {
      paletteRef.current = readPalette(canvas);
      paint();
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [paint]);

  /* Preload, then open the gate. */
  useEffect(() => {
    const controller = new AbortController();
    const source = createHeroFrameSource();
    sourceRef.current = source;

    source
      .load((fraction) => {
        if (!controller.signal.aborted) setLoaded(fraction);
      }, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        readyRef.current = true;
        setReady(true);
        paint();
        onReady?.();
      })
      .catch(() => {
        // Aborted by unmount, or the sequence could not be fetched. Either way
        // there is nothing to show and nothing to report — the hero is
        // decorative, and the copy underneath it stands on its own.
      });

    return () => controller.abort();
    // onReady is called exactly once per mount; re-running this effect because
    // the parent re-created the callback would restart the whole preload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  return (
    <div className="lp-canvas-stage" aria-hidden="true">
      <canvas ref={canvasRef} className={`lp-canvas${ready ? ' is-ready' : ''}`} />
      {!ready && (
        <div className="lp-canvas-loader">
          <i style={{ ['--fill' as string]: loaded }} />
        </div>
      )}
    </div>
  );
});

export default HeroCanvas;
