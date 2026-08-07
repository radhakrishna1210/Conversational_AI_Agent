import { useEffect, useState } from 'react';
import { gsap, ScrollTrigger, FULL_MOTION, REDUCED_MOTION, stickyHeaderHeight } from '@/lib/motion/gsap';
import type { HeroCanvasHandle } from './HeroCanvas';

/* ═══════════════════════════════════════════════════════════════════════════
   Every scroll-driven behaviour on the landing page, in one place.

   The page previously ran two hand-rolled systems: an IntersectionObserver for
   reveals and a rAF-throttled scroll listener for the rail. Both are now
   ScrollTriggers, so there is a single scroll authority that Lenis can drive
   and a single thing to refresh when the layout changes.

   ─── Structure ────────────────────────────────────────────────────────────
   Everything is created inside one gsap.matchMedia(). That matters more than
   it looks: matchMedia does not merely skip animations under
   prefers-reduced-motion, it never creates the pins and scrubs at all, and it
   fully reverts them — inline styles, pin-spacers and all — if the reader
   flips the setting mid-session. A single ctx.revert() on unmount undoes the
   lot, which is what keeps this safe inside a client-side-routed app where the
   landing page is mounted and unmounted repeatedly.

   ─── A note on pinning ────────────────────────────────────────────────────
   The hero pins whole: it is viewport-sized by design. The two content-heavy
   sections pin their *heading column* instead, and let the cards and the
   pricing panel travel past it. Pinning those sections whole would fix an
   ~880px block inside a ~660px viewport and clip the bottom third of the
   content off the screen with no way to reach it. Pinning the column that does
   fit gives the same "the section holds while its contents play out" reading
   without ever making content unreachable — and it degrades to plain scrolling
   on short viewports, where the query below stops matching.
   ══════════════════════════════════════════════════════════════════════════ */

/** Pins only exist where there is room for them. Below either bound the
 *  section falls back to reveals on natural scroll. */
const PINNABLE = '(min-width: 941px) and (min-height: 700px)';

export interface LandingMotionOptions {
  rootRef: React.RefObject<HTMLElement>;
  heroRef: React.RefObject<HTMLElement>;
  canvasRef: React.RefObject<HeroCanvasHandle>;
  /** Section elements, in beat order — the same list the rail scrubs. */
  sectionRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  /** The hero canvas has finished preloading. Pins are held until this is true
   *  so the first scroll never lands on a half-decoded sequence. */
  ready: boolean;
  /** Bumped when async content changes the page height (the wallet rate
   *  arriving), so ScrollTrigger can re-measure every start and end. */
  layoutKey: unknown;
}

export function useLandingMotion({
  rootRef,
  heroRef,
  canvasRef,
  sectionRefs,
  ready,
  layoutKey,
}: LandingMotionOptions): number {
  const [activeBeat, setActiveBeat] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;

    const mm = gsap.matchMedia();

    mm.add(
      { full: FULL_MOTION, reduced: REDUCED_MOTION, pinnable: PINNABLE },
      (context) => {
        const { full, pinnable } = context.conditions as Record<string, boolean>;

        /* ── Reduced motion ────────────────────────────────────────────────
           Resolve everything to its finished state and create nothing. The
           stylesheet does the same via its own media query; this is the belt
           to that pair of braces, and it also covers the case where the
           setting is switched on after the page has already animated. */
        if (!full) {
          gsap.set(root.querySelectorAll('.lp-reveal'), { opacity: 1, y: 0, x: 0, clearProps: 'transform' });
          root.querySelectorAll('.lp-reveal').forEach((el) => el.classList.add('is-in'));
          root.style.setProperty('--lp-progress', '1');
          canvasRef.current?.draw(1); // The settled frame — a call that ended.
          return;
        }

        root.classList.add('lp-motion');

        /* ── 1. The rail ────────────────────────────────────────────────────
           One trigger spanning the page writes a custom property; the rail's
           fill is a scaleY off that property, so this never costs layout. */
        ScrollTrigger.create({
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => root.style.setProperty('--lp-progress', String(self.progress)),
        });

        // Which beat is live. The upper third of the viewport is the line at
        // which a section starts reading as "the one I am in".
        sectionRefs.current.forEach((section, i) => {
          if (!section) return;
          ScrollTrigger.create({
            trigger: section,
            start: 'top 34%',
            end: 'bottom 34%',
            onToggle: (self) => self.isActive && setActiveBeat(i),
          });
        });

        /* ── 2. The hero: pin + canvas scrub ────────────────────────────────
           The canvas is scrubbed directly rather than through a tween. A tween
           would interpolate toward the scroll position with its own easing on
           top of Lenis', and the frame would visibly trail the scrollbar. */
        const hero = heroRef.current;
        if (hero) {
          ScrollTrigger.create({
            trigger: hero,
            start: () => `top ${stickyHeaderHeight()}px`,
            end: () => `+=${window.innerHeight * 1.15}`,
            pin: true,
            pinSpacing: true,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => canvasRef.current?.draw(self.progress),
            onRefresh: (self) => canvasRef.current?.draw(self.progress),
          });

          // The copy drifts up and dims as the call plays out beneath it, so
          // the hero hands over to the next section instead of cutting.
          gsap.to(hero.querySelector('.lp-hero-copy'), {
            y: -46,
            opacity: 0.32,
            ease: 'none',
            scrollTrigger: {
              trigger: hero,
              start: () => `top ${stickyHeaderHeight()}px`,
              end: () => `+=${window.innerHeight * 1.15}`,
              scrub: true,
              invalidateOnRefresh: true,
            },
          });

          // The meter holds longer — it is the thing the hero is about — then
          // lifts away with a touch of scale so the layers separate in depth.
          gsap.to(hero.querySelector('.lp-meter'), {
            y: -18,
            scale: 0.94,
            opacity: 0.4,
            ease: 'none',
            scrollTrigger: {
              trigger: hero,
              start: () => `top+=${window.innerHeight * 0.35} ${stickyHeaderHeight()}px`,
              end: () => `+=${window.innerHeight * 0.8}`,
              scrub: true,
              invalidateOnRefresh: true,
            },
          });

          // Parallax on the aurora: each blob at its own rate, so the backdrop
          // has depth rather than sliding as one sheet.
          hero.querySelectorAll<HTMLElement>('.lp-aurora span').forEach((blob, i) => {
            gsap.to(blob, {
              yPercent: [14, 26, 8][i] ?? 14,
              ease: 'none',
              scrollTrigger: {
                trigger: hero,
                start: 'top top',
                end: () => `+=${window.innerHeight * 1.6}`,
                scrub: true,
                invalidateOnRefresh: true,
              },
            });
          });
        }

        /* ── 3. Reveals ─────────────────────────────────────────────────────
           batch() collects everything crossing the line within a short window
           and animates them as one staggered group, which is both cheaper than
           a trigger per node and what makes a grid of cards read as dealt
           rather than as six independent fades. */
        ScrollTrigger.batch(root.querySelectorAll('.lp-reveal'), {
          start: 'top 88%',
          once: true,
          onEnter: (batch) => {
            batch.forEach((el) => el.classList.add('is-in'));
            gsap.to(batch, {
              opacity: 1,
              x: 0,
              y: 0,
              duration: 0.75,
              ease: 'power3.out',
              stagger: 0.07,
              overwrite: true,
            });
          },
        });

        /* ── 4. Section wipes ───────────────────────────────────────────────
           A curtain across each section's top edge, wiped away on scroll. It
           is a scaleY on a gradient, not a clip-path or a mask: those are not
           reliably compositor-driven, and this runs on every section boundary
           of a long page. The effect reads the same. */
        root.querySelectorAll<HTMLElement>('.lp-wipe').forEach((curtain) => {
          gsap.fromTo(
            curtain,
            { scaleY: 1 },
            {
              scaleY: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: curtain.parentElement,
                start: 'top bottom',
                end: 'top 55%',
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
        });

        /* ── 5. Content-heavy sections ──────────────────────────────────────
           The heading column holds while its content travels past. Only where
           there is vertical room — see PINNABLE. */
        if (pinnable) {
          root.querySelectorAll<HTMLElement>('[data-pin-head]').forEach((section) => {
            const head = section.querySelector<HTMLElement>('.lp-head, .lp-settle > :first-child');
            const body = section.querySelector<HTMLElement>('[data-pin-body]');
            if (!head || !body) return;

            ScrollTrigger.create({
              trigger: section,
              // The head parks just under the sticky navbar, with a little air.
              start: () => `top ${stickyHeaderHeight() + 88}px`,
              // Release as the last of the body clears, never later — a pin
              // that outlives its content leaves a dead scroll region.
              endTrigger: body,
              end: () => `bottom ${stickyHeaderHeight() + 220}px`,
              pin: head,
              pinSpacing: false,
              invalidateOnRefresh: true,
            });

            // A slow lift on the body against the held head. Small on purpose:
            // this is depth, not a second animation competing with the reveals.
            gsap.fromTo(
              body,
              { y: 34 },
              {
                y: -18,
                ease: 'none',
                scrollTrigger: {
                  trigger: section,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: 1.2,
                  invalidateOnRefresh: true,
                },
              },
            );
          });
        }

        /* ── 6. Count-ups ───────────────────────────────────────────────────
           Applied to the hero spec strip only. Every rupee figure on this page
           is left exact and instant, deliberately: rAF is suspended in a
           background tab, so a ramp can stall part-way and leave a WRONG price
           on screen. A stalled animation is cosmetic; a stalled price is a
           false statement. The specs below are durations and counts, not
           money, and each one still writes its exact final value in
           onComplete so a stalled ramp cannot strand a wrong number. */
        root.querySelectorAll<HTMLElement>('[data-countup]').forEach((el) => {
          const to = Number(el.dataset.countup);
          if (!Number.isFinite(to)) return;
          const prefix = el.dataset.countupPrefix ?? '';
          const suffix = el.dataset.countupSuffix ?? '';
          const settle = () => { el.textContent = `${prefix}${to}${suffix}`; };

          const counter = { value: 0 };
          gsap.to(counter, {
            value: to,
            duration: 1.4,
            ease: 'power2.out',
            onUpdate: () => { el.textContent = `${prefix}${Math.round(counter.value)}${suffix}`; },
            onComplete: settle,
            onInterrupt: settle,
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          });
        });

        /* ── 7. Closing orb parallax ────────────────────────────────────── */
        const close = root.querySelector<HTMLElement>('.lp-close');
        if (close) {
          gsap.fromTo(
            close.querySelector('.lp-close-inner'),
            { y: 40 },
            {
              y: -10,
              ease: 'none',
              scrollTrigger: { trigger: close, start: 'top bottom', end: 'bottom bottom', scrub: true },
            },
          );
        }

        return () => root.classList.remove('lp-motion');
      },
    );

    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* Async content changes the page's height — the wallet rate arriving swaps a
     "Loading…" string for a price and a note, and the FAQ opens and closes.
     Every start and end above was measured against the old height, so they all
     have to be re-measured. */
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 60);
    return () => window.clearTimeout(id);
  }, [ready, layoutKey]);

  return activeBeat;
}
