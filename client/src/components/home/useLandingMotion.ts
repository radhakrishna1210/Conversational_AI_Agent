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

export interface LandingMotion {
  /** Index of the beat the reader is currently in — drives the fixed rail. */
  activeBeat: number;
  /**
   * True when the scroll rig is allowed to run. Home renders this as the
   * `lp-motion` class rather than the hook adding it with classList.
   *
   * That is not a style preference. React owns className on that element, and
   * it rewrites the attribute whenever the prop changes — the hero's load
   * choreography flips `lp-lit` about 40ms after mount, which silently wiped a
   * class added imperatively before it. Anything React might overwrite has to
   * come from React.
   */
  enabled: boolean;
}

/** Live-updating match for the motion preference, so flipping the OS setting
 *  mid-session takes effect without a reload. */
function useMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(
    () => typeof window === 'undefined' || window.matchMedia(FULL_MOTION).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(FULL_MOTION);
    const sync = () => setEnabled(query.matches);
    query.addEventListener('change', sync);
    sync();
    return () => query.removeEventListener('change', sync);
  }, []);
  return enabled;
}

export function useLandingMotion({
  rootRef,
  heroRef,
  canvasRef,
  sectionRefs,
  ready,
  layoutKey,
}: LandingMotionOptions): LandingMotion {
  const [activeBeat, setActiveBeat] = useState(0);
  const enabled = useMotionEnabled();

  /* The pinned hero sizes itself to the space left under the sticky navbar, so
     the height has to reach CSS before the hero is laid out — not when the
     rig starts, which is a canvas-preload later. Published here, on mount, and
     kept current on resize. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const publish = () => root.style.setProperty('--lp-header', `${stickyHeaderHeight()}px`);
    publish();
    window.addEventListener('resize', publish, { passive: true });
    return () => window.removeEventListener('resize', publish);
  }, [rootRef, enabled]);

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
          const revealed = root.querySelectorAll<HTMLElement>('.lp-reveal');
          gsap.set(revealed, { opacity: 1, clearProps: 'transform' });
          revealed.forEach((el) => el.classList.add('is-in'));
          root.style.setProperty('--lp-progress', '1');
          canvasRef.current?.draw(1); // The settled frame — a call that ended.
          return;
        }

        // Re-measured on every refresh too: a font load or a dismissed
        // announcement bar changes the chrome's height, and the hero is sized
        // against it.
        const publishHeaderHeight = () =>
          root.style.setProperty('--lp-header', `${stickyHeaderHeight()}px`);
        ScrollTrigger.addEventListener('refreshInit', publishHeaderHeight);

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
          /* The pinned hero is sized by CSS to the space under the navbar, but
             on a short viewport its content can still be taller than that — a
             stacked layout on a laptop in landscape, say. Pinning then would
             put the spec strip permanently below the fold with no scroll left
             to reach it, because the pin consumes it. So the fit is measured,
             and a hero that does not fit scrubs its canvas against natural
             scroll instead of being held. */
          const heroFits =
            hero.getBoundingClientRect().height <= window.innerHeight - stickyHeaderHeight() + 1;

          ScrollTrigger.create({
            trigger: hero,
            start: () => `top ${stickyHeaderHeight()}px`,
            end: () => `+=${window.innerHeight * 1.15}`,
            pin: heroFits,
            pinSpacing: heroFits,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => canvasRef.current?.draw(self.progress),
            onRefresh: (self) => canvasRef.current?.draw(self.progress),
          });

          /* The copy drifts up and dims as the call plays out beneath it, so
             the hero hands over to the next section instead of cutting.

             fromTo with immediateRender:false, not to(). A scrubbed to() tween
             renders at progress 0 the moment it is created, which captures
             whatever opacity these elements happen to have *at that instant*
             and writes it inline. Both of them are mid-entrance at that point
             — the hero's load choreography fades .lp-meter in from 0 — so a
             to() tween can capture 0 and pin the meter invisible, since inline
             styles beat the .lp-lit class that was about to reveal it.
             immediateRender:false means nothing is written until the reader
             actually scrolls, by which time the entrance has finished. */
          gsap.fromTo(
            hero.querySelector('.lp-hero-copy'),
            { y: 0, opacity: 1 },
            {
              y: -46,
              opacity: 0.32,
              ease: 'none',
              immediateRender: false,
              scrollTrigger: {
                trigger: hero,
                start: () => `top ${stickyHeaderHeight()}px`,
                end: () => `+=${window.innerHeight * 1.15}`,
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );

          // The meter holds longer — it is the thing the hero is about — then
          // lifts away with a touch of scale so the layers separate in depth.
          gsap.fromTo(
            hero.querySelector('.lp-meter'),
            { y: 0, scale: 1, opacity: 1 },
            {
              y: -18,
              scale: 0.94,
              opacity: 0.4,
              ease: 'none',
              immediateRender: false,
              scrollTrigger: {
                trigger: hero,
                start: () => `top+=${window.innerHeight * 0.35} ${stickyHeaderHeight()}px`,
                end: () => `+=${window.innerHeight * 0.8}`,
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );

          /* Parallax on the aurora, applied to the container rather than to
             the three blobs inside it. The blobs each run a long CSS keyframe
             drift, and a running CSS animation overrides inline styles — so a
             yPercent written onto a blob by GSAP would simply never paint.
             Moving their shared parent composes with the drift instead of
             fighting it, and the hero still reads as layered: backdrop, canvas
             and copy each travel at a different rate. */
          gsap.fromTo(
            hero.querySelector('.lp-aurora'),
            { yPercent: 0 },
            {
              yPercent: 18,
              ease: 'none',
              immediateRender: false,
              scrollTrigger: {
                trigger: hero,
                start: 'top top',
                end: () => `+=${window.innerHeight * 1.6}`,
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
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

        /* ── 5. Pinned sections ─────────────────────────────────────────────
           Two different patterns, because the two sections have different
           shapes and one pattern does not fit both.

           [data-pin-section] — the whole section holds while its cards deal
           themselves in. Only viable while the section actually fits between
           the navbar and the bottom of the viewport; a pinned block taller
           than its viewport has its overflow permanently off-screen and
           unreachable, since the pin consumes the scroll that would reveal it.
           So it is measured, not assumed, and falls back to a plain scrubbed
           reveal when it does not fit. The measurement is inside a function-
           form guard so `invalidateOnRefresh` re-runs it after a resize.

           Sections marked for pinning also get their vertical padding trimmed
           by the stylesheet under .lp-motion, which is what brings the pricing
           section inside the viewport; without it, it missed by three pixels
           and silently fell back to the unpinned path. */
        root.querySelectorAll<HTMLElement>('[data-pin-section]').forEach((section) => {
          const cards = section.querySelector<HTMLElement>('[data-pin-body]');
          if (!cards) return;

          // Does the section fit between the navbar and the bottom of the
          // viewport? Measured rather than assumed: a pinned block taller than
          // its viewport has its overflow permanently off-screen, because the
          // pin consumes exactly the scroll that would have revealed it.
          const pinned =
            pinnable &&
            section.getBoundingClientRect().height <=
              window.innerHeight - stickyHeaderHeight() - 24;

          // Array.from rather than the live HTMLCollection: the tween should
          // hold the set of children as it was when the timeline was built,
          // not a collection that would silently change under it if the list
          // ever became dynamic.
          const reveal = gsap.fromTo(
            Array.from(cards.children),
            { y: 56, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              ease: 'power2.out',
              stagger: pinned ? 0.16 : 0.12,
              duration: 1,
              // immediateRender is left on (the fromTo default) so the cards
              // are already hidden when the trigger is reached. Deferring it
              // would leave them painted at rest and then snap them back to
              // y:56 the instant the section crossed the start line.
            },
          );

          // The choreography is the same either way; the pin only changes what
          // the reader is looking at while it plays. Where the section cannot
          // be held, it plays against natural scroll instead.
          ScrollTrigger.create(
            pinned
              ? {
                  animation: reveal,
                  trigger: section,
                  start: () => `top ${stickyHeaderHeight()}px`,
                  end: () => `+=${window.innerHeight * 0.9}`,
                  pin: true,
                  pinSpacing: true,
                  scrub: 0.6,
                  anticipatePin: 1,
                  invalidateOnRefresh: true,
                }
              : {
                  animation: reveal,
                  trigger: cards,
                  start: 'top 88%',
                  end: 'bottom 70%',
                  scrub: 0.8,
                  invalidateOnRefresh: true,
                },
          );
        });

        /* An earlier version pinned just the pricing section's left column
           while the right one travelled past. Measured, the two columns are
           455px and 437px — near enough identical, so the "pinned" column
           would have been held for eighteen pixels of travel. Nothing to hold
           against, so the whole section pins instead, above. */

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

        return () => ScrollTrigger.removeEventListener('refreshInit', publishHeaderHeight);
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

  return { activeBeat, enabled };
}
