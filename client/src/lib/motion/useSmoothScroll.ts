import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from './gsap';
import './lenis.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Smooth scroll, scoped to whichever page mounts it.

   Deliberately NOT mounted app-wide. Lenis takes over <html>'s scrolling, and
   the dashboard, admin console and every modal in this app rely on native
   scroll containers and native anchor behaviour. A page opts in, and destroy()
   on unmount hands scrolling back exactly as it was.

   The one non-obvious wiring requirement is that Lenis and ScrollTrigger must
   share a single clock. Lenis needs a rAF loop to advance its animated scroll
   position, and ScrollTrigger needs to be told after each of those steps that
   the position moved. Running two independent rAF loops makes ScrollTrigger
   read a scroll position from the previous frame, which shows up as pinned
   sections lagging a frame behind the pointer. So: GSAP's ticker drives Lenis,
   and Lenis' scroll event drives ScrollTrigger.update.
   ══════════════════════════════════════════════════════════════════════════ */

export interface SmoothScrollApi {
  /** Scroll to an element or offset through Lenis, so the easing matches the
   *  rest of the page. Falls back to native scrolling when Lenis is not
   *  running (reduced motion, or before the effect has mounted). */
  scrollTo: (target: HTMLElement | number, offset?: number) => void;
}

export function useSmoothScroll(): React.MutableRefObject<SmoothScrollApi> {
  const lenisRef = useRef<Lenis | null>(null);

  // A stable object so callers can hold it across renders without re-binding.
  const api = useRef<SmoothScrollApi>({
    scrollTo: (target, offset = 0) => {
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(target, { offset });
        return;
      }
      if (typeof target === 'number') {
        window.scrollTo({ top: target + offset, behavior: 'auto' });
      } else {
        // Reduced motion: jump, do not glide.
        const top = target.getBoundingClientRect().top + window.scrollY + offset;
        window.scrollTo({ top, behavior: 'auto' });
      }
    },
  });

  useEffect(() => {
    // Inertial scrolling is the single most motion-sickness-inducing thing on
    // this page. Under prefers-reduced-motion Lenis is never constructed at
    // all, and scrollTo above degrades to an instant native jump.
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      duration: 1.05,
      // Exponential ease-out: fast pickup, long soft tail. This is the curve
      // that reads as "weight" rather than as lag.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Touch devices already have hardware-accelerated inertia. Syncing it to
      // Lenis makes phones feel worse, not better, so native scroll is left
      // alone there and only ScrollTrigger's own updates run.
      syncTouch: false,
    });
    lenisRef.current = lenis;

    // Every Lenis step ends by telling ScrollTrigger where the page now is, in
    // the same frame, before anything paints.
    lenis.on('scroll', ScrollTrigger.update);

    // GSAP's ticker is already running for every other tween on the page;
    // adding Lenis to it means one rAF loop instead of two. The ticker reports
    // seconds, Lenis wants milliseconds.
    const drive = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(drive);

    // Lag smoothing exists to skip animation forward after the main thread
    // stalls. On a scroll-scrubbed page that produces a jump to a scroll
    // position the reader never scrolled to, so it is off while Lenis is
    // driving the page.
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(drive);
      gsap.ticker.lagSmoothing(500, 33); // GSAP's own defaults
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return api;
}
