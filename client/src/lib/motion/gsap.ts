/* ═══════════════════════════════════════════════════════════════════════════
   GSAP registration — one place, imported everywhere.

   registerPlugin is idempotent but the import itself is not free, and having a
   single module means there is exactly one ScrollTrigger instance in the bundle
   no matter how many components animate. Import { gsap, ScrollTrigger } from
   here rather than from 'gsap' directly.
   ══════════════════════════════════════════════════════════════════════════ */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/** Media queries for gsap.matchMedia(). Everything scroll-driven is registered
 *  under FULL_MOTION so it is never even created for a reader who opted out —
 *  matchMedia reverts the whole context when the query stops matching, which is
 *  stronger than disabling animations after the fact. */
export const FULL_MOTION = '(prefers-reduced-motion: no-preference)';
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia(REDUCED_MOTION).matches;

/**
 * Height of the app's sticky header, in px.
 *
 * The site chrome is `.navbar { position: sticky; top: 0 }`. A ScrollTrigger
 * pin puts its target at the viewport top, which would slide the pinned section
 * underneath that bar. Every pin on the landing page therefore starts at
 * `top ${stickyHeaderHeight()}px` instead of `top top`.
 *
 * Measured rather than hardcoded because the navbar's height changes with the
 * viewport, and because the dismissible announcement bar above it may or may
 * not be in the flow. Called from ScrollTrigger's function-form start/end, so
 * it is re-read on every refresh (resize, font load) rather than captured once.
 */
export function stickyHeaderHeight(): number {
  if (typeof document === 'undefined') return 0;
  const bar = document.querySelector<HTMLElement>('.navbar');
  if (!bar) return 0;
  // Only a sticky/fixed bar actually overlaps pinned content; if the styling
  // ever changes to static, the pin should go all the way to the top.
  const position = window.getComputedStyle(bar).position;
  if (position !== 'sticky' && position !== 'fixed') return 0;
  return Math.round(bar.getBoundingClientRect().height);
}
