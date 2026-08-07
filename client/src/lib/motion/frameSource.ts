/* ═══════════════════════════════════════════════════════════════════════════
   HERO FRAME SOURCES

   The hero canvas is scrubbed by scroll position: ScrollTrigger hands it a
   progress value from 0 to 1 and it paints the corresponding frame. What
   "frame" means is behind this interface, so the scrubbing machinery in
   HeroCanvas never learns whether it is compositing a decoded WebP or drawing
   arcs by hand.

   Two implementations:

     ProceduralCallSource   Draws the frame in code. Ships today, weighs
                            nothing, and resolves at any resolution. This is
                            the default.

     ImageSequenceSource    The classic Apple treatment — preload N stills,
                            draw the one nearest the scroll position.

   ─── Switching to real frames ──────────────────────────────────────────────
   Export a sequence to WebP, drop it in client/public/hero-frames/, and set
   HERO_FRAMES below. Nothing else changes: the preloader, the loading gate,
   the pin, the scrub and the reduced-motion fallback are all already wired.

       export const HERO_FRAMES: FrameManifest | null = {
         path: (i) => `/hero-frames/${String(i).padStart(4, '0')}.webp`,
         count: 160,
       };

   Frames are 0-indexed. Keep the count under ~180 and each file under ~40 KB:
   the preloader blocks the hero animation until every frame has decoded, so
   the sequence's total weight is directly the hero's time-to-interactive.
   ══════════════════════════════════════════════════════════════════════════ */

export interface FramePalette {
  /** Teal. The agent — same legend as the rest of the landing page. */
  agent: string;
  /** Slate. The caller. */
  caller: string;
  /** Amber. Money, and nothing but money. */
  money: string;
  /** Hairlines and inactive marks. */
  dim: string;
}

export interface FrameView {
  /** CSS pixels, not device pixels — the context is pre-scaled by DPR. */
  width: number;
  height: number;
  /** Single-column layout. The hero copy spans the full width below 940px, so
   *  the artwork has to get out from behind it rather than beside it. */
  narrow: boolean;
  palette: FramePalette;
}

export interface FrameSource {
  /** Resolve once the source can paint any progress value without stalling.
   *  `onProgress` reports 0 → 1 so the hero can show a determinate loader. */
  load(onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void>;
  /** Paint the frame at `progress` (0 → 1). Must clear the canvas itself, and
   *  must be safe to call many times per second at any progress in any order —
   *  scrubbing goes backwards as often as forwards. */
  draw(ctx: CanvasRenderingContext2D, progress: number, view: FrameView): void;
}

export interface FrameManifest {
  /** 0-indexed frame → URL. */
  path: (index: number) => string;
  count: number;
}

/** null → the procedural source is used. See the header comment. */
export const HERO_FRAMES: FrameManifest | null = null;

/* ── Maths ──────────────────────────────────────────────────────────────── */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Normalised position of `p` inside the window [a, b], clamped at both ends.
 *  Every phase of the procedural scene is expressed as one of these, so phases
 *  can overlap and cross-fade by simply overlapping their windows. */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── Procedural ─────────────────────────────────────────────────────────────

   One call, told as an abstract three-act scene over the scroll of the hero:

     0.00 → 0.30   CONNECT   rings radiate from the dial point
     0.22 → 0.78   TALK      a waveform builds left to right under a playhead
     0.74 → 1.00   SETTLE    the waveform collapses to a line and an amber
                             pulse runs its length

   Deliberately abstract, and deliberately carrying no digits. The live call
   meter sitting on top of this canvas shows a real clock, a real balance and a
   real per-minute rate; if the backdrop also counted, the two would disagree
   the moment scroll position and wall-clock time diverged — which is always.
   The backdrop carries the *shape* of a call, the meter carries the numbers.  */

const BARS = 104;

/** Amplitude of bar `i`. Three incommensurable sines, so the envelope never
 *  visibly repeats across the width but is identical on every render. */
const amplitudeAt = (i: number) =>
  0.26 +
  0.74 *
    Math.abs(
      Math.sin(i * 0.7) * 0.5 + Math.sin(i * 0.23 + 1.3) * 0.34 + Math.sin(i * 1.9) * 0.16,
    );

/** Who is speaking. A slow sine gives runs of ~9 bars, so the tape reads as
 *  turns in a conversation rather than as alternating stripes. */
const isAgentAt = (i: number) => Math.sin(i * 0.35) > -0.08;

export class ProceduralCallSource implements FrameSource {
  async load(onProgress: (fraction: number) => void): Promise<void> {
    onProgress(1); // Nothing to fetch; the gate opens on the first paint.
  }

  draw(ctx: CanvasRenderingContext2D, progress: number, view: FrameView): void {
    const { width: w, height: h, narrow, palette } = view;
    ctx.clearRect(0, 0, w, h);

    // The dial point sits behind the meter card in two columns, and high and
    // centred when the layout stacks.
    const cx = narrow ? w * 0.5 : w * 0.7;
    const cy = narrow ? h * 0.34 : h * 0.5;

    this.drawConnect(ctx, progress, w, h, cx, cy, palette);
    this.drawTape(ctx, progress, w, h, narrow, palette);
    this.drawSettle(ctx, progress, w, h, narrow, palette);

    ctx.globalAlpha = 1;
    this.maskForCopy(ctx, w, h, narrow);
  }

  /* Act 1 — four rings leaving the dial point, each starting a beat after the
     last, fading as they grow. */
  private drawConnect(
    ctx: CanvasRenderingContext2D,
    p: number,
    w: number,
    h: number,
    cx: number,
    cy: number,
    palette: FramePalette,
  ) {
    const fade = 1 - seg(p, 0.26, 0.44);
    if (fade <= 0) return;

    const grow = seg(p, 0, 0.3);
    const reach = Math.max(w, h) * 0.44;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.agent;
    for (let ring = 0; ring < 4; ring++) {
      const t = clamp01(grow * 1.3 - ring * 0.13);
      if (t <= 0) continue;
      ctx.globalAlpha = (1 - t) * 0.55 * fade;
      ctx.beginPath();
      ctx.arc(cx, cy, easeOut(t) * reach, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The dial point itself, breathing open as the first ring leaves.
    ctx.globalAlpha = 0.9 * fade * easeOut(clamp01(grow * 4));
    ctx.fillStyle = palette.agent;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Act 2 — the waveform. Bars are revealed by a playhead sweeping left to
     right, and collapse toward the centre line during act 3. */
  private drawTape(
    ctx: CanvasRenderingContext2D,
    p: number,
    w: number,
    h: number,
    narrow: boolean,
    palette: FramePalette,
  ) {
    const talk = seg(p, 0.22, 0.78);
    if (talk <= 0) return;

    const collapse = 1 - easeOut(seg(p, 0.74, 0.98));
    const midY = narrow ? h * 0.68 : h * 0.5;
    const band = h * (narrow ? 0.2 : 0.3);
    const step = w / BARS;
    const barW = Math.max(2, step * 0.42);

    for (let i = 0; i < BARS; i++) {
      const at = i / (BARS - 1);
      // Reveal window: the playhead is at `talk`, and each bar takes a short
      // moment to rise once passed. 0.86 keeps the last bars from all landing
      // simultaneously at the very end of the sweep.
      const risen = clamp01((talk - at * 0.86) * 7);
      if (risen <= 0) continue;

      const half = band * amplitudeAt(i) * easeOut(risen) * collapse * 0.5 + 1;
      const x = i * step + (step - barW) / 2;

      // The four bars behind the playhead are hot, matching the live tape in
      // the meter card so the two read as the same instrument.
      const distance = talk - at * 0.86;
      const hot = distance > 0 && distance < 0.055 ? 1 : 0;

      ctx.globalAlpha = (isAgentAt(i) ? 0.5 : 0.34) * risen * (1 - 0.55 * (1 - collapse)) + hot * 0.35;
      ctx.fillStyle = isAgentAt(i) ? palette.agent : palette.caller;
      this.roundedBar(ctx, x, midY - half, barW, half * 2, Math.min(barW / 2, 2));
    }
  }

  /* Act 3 — the call ends: a hairline where the waveform was, and one amber
     sweep along it. Amber is the money colour on this page, so this is the
     wallet settling, not a decorative flourish. */
  private drawSettle(
    ctx: CanvasRenderingContext2D,
    p: number,
    w: number,
    h: number,
    narrow: boolean,
    palette: FramePalette,
  ) {
    const settle = seg(p, 0.74, 1);
    if (settle <= 0) return;

    const midY = narrow ? h * 0.68 : h * 0.5;

    ctx.globalAlpha = 0.5 * settle;
    ctx.strokeStyle = palette.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY + 0.5);
    ctx.lineTo(w, midY + 0.5);
    ctx.stroke();

    const head = easeInOut(settle) * w;
    const tail = Math.max(0, head - w * 0.26);
    if (head <= tail) return;

    const sweep = ctx.createLinearGradient(tail, 0, head, 0);
    sweep.addColorStop(0, 'transparent');
    sweep.addColorStop(1, palette.money);

    ctx.globalAlpha = 0.85 * (1 - seg(p, 0.94, 1) * 0.4);
    ctx.strokeStyle = sweep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tail, midY + 0.5);
    ctx.lineTo(head, midY + 0.5);
    ctx.stroke();
  }

  private roundedBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    // roundRect is in every browser this app supports, but the guard costs one
    // property read and saves a hard throw in an older embedded webview.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  /* The headline and lede sit on top of this canvas, and contrast beats
     decoration. Punch the artwork back out from underneath the copy with a
     destination-out gradient — left in two columns, top when it stacks. */
  private maskForCopy(ctx: CanvasRenderingContext2D, w: number, h: number, narrow: boolean) {
    ctx.globalCompositeOperation = 'destination-out';

    // Reaches further and stays stronger for longer than a plain linear ramp:
    // measured against the hero at 1440px, a 60%-width ramp still left the
    // waveform at about half strength directly behind the lede.
    const span = narrow ? h * 0.56 : w * 0.68;
    const fade = narrow
      ? ctx.createLinearGradient(0, 0, 0, span)
      : ctx.createLinearGradient(0, 0, span, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0.97)');
    fade.addColorStop(0.6, 'rgba(0,0,0,0.72)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, narrow ? w : span, narrow ? span : h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ── Image sequence ─────────────────────────────────────────────────────── */

export class ImageSequenceSource implements FrameSource {
  private readonly frames: HTMLImageElement[] = [];

  constructor(private readonly manifest: FrameManifest) {}

  load(onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void> {
    const { count, path } = this.manifest;
    let settled = 0;

    return new Promise((resolve, reject) => {
      if (count <= 0) {
        resolve();
        return;
      }
      const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });

      const tick = () => {
        settled += 1;
        onProgress(settled / count);
        if (settled === count) {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }
      };

      for (let i = 0; i < count; i++) {
        const img = new Image();
        // Frames are decorative and identical for every visitor; decoding them
        // off the main thread keeps the scrub from hitching on first paint.
        img.decoding = 'async';
        // A missing frame must not hang the loader forever — the gate opening
        // on an incomplete sequence just means one blank frame while scrubbing,
        // whereas a hero stuck behind a spinner is the whole page lost.
        img.onload = tick;
        img.onerror = tick;
        img.src = path(i);
        this.frames[i] = img;
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D, progress: number, view: FrameView): void {
    const index = Math.min(
      this.manifest.count - 1,
      Math.max(0, Math.round(progress * (this.manifest.count - 1))),
    );
    const frame = this.frames[index];
    ctx.clearRect(0, 0, view.width, view.height);
    if (!frame?.naturalWidth) return;

    // object-fit: cover, by hand.
    const scale = Math.max(view.width / frame.naturalWidth, view.height / frame.naturalHeight);
    const w = frame.naturalWidth * scale;
    const h = frame.naturalHeight * scale;
    ctx.drawImage(frame, (view.width - w) / 2, (view.height - h) / 2, w, h);
  }
}

export function createHeroFrameSource(): FrameSource {
  return HERO_FRAMES ? new ImageSequenceSource(HERO_FRAMES) : new ProceduralCallSource();
}
