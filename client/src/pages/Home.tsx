import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck, Filter, HeadphonesIcon, IndianRupee, MessageSquare,
  Mic, Phone, PhoneForwarded, Plus, Radio, Send, Webhook,
} from 'lucide-react';
import HeroCanvas, { type HeroCanvasHandle } from '@/components/home/HeroCanvas';
import { useLandingMotion } from '@/components/home/useLandingMotion';
import { useSmoothScroll } from '@/lib/motion/useSmoothScroll';
import { stickyHeaderHeight } from '@/lib/motion/gsap';
import './Home.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Landing page.

   Structured as a call's timeline: each section is stamped with the second at
   which the thing it describes happens, a fixed rail tracks how far into that
   call you have scrolled, and the page ends on the close CTA.

   NO PRICE APPEARS ON THIS PAGE — deliberately, and this is not an oversight
   to be "fixed" later. A visitor who meets a rate before they have understood
   the product prices the number against nothing, so pricing here is a
   conversation: every place a figure would have gone now points at /contact.
   The page used to render a "Settle — the wallet" section fed by
   GET /config/wallet-rate, plus a monthly estimator and a live rupee meter in
   the hero; all three are gone. Do not reintroduce a rate, a wallet balance, a
   top-up figure or a cost estimator on the landing page. The live rate still
   lives where it belongs: the signed-in wallet and Super Admin → Wallet Rate.

   MOTION. GSAP + ScrollTrigger, with Lenis driving the scroll itself. All of
   it lives in two places rather than being scattered through this file:

     useSmoothScroll   — Lenis, mounted for this page only, wired into
                         ScrollTrigger through one shared rAF ticker.
     useLandingMotion  — every pin, scrub, reveal, wipe and parallax on the
                         page, created inside a single gsap.matchMedia().

   The hero is a scroll-scrubbed <canvas> (see components/home/HeroCanvas and
   lib/motion/frameSource). Under prefers-reduced-motion none of it is created:
   Lenis is never constructed, no pin exists, and every reveal resolves to its
   finished state.

   ══════════════════════════════════════════════════════════════════════════ */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/*
 * The reveal system and the timeline rail used to be hand-rolled here — an
 * IntersectionObserver and a rAF-throttled scroll listener. Both are now
 * ScrollTriggers inside useLandingMotion, because a page with a scrubbed pin
 * needs exactly one authority on where the scroll is: Lenis animates the
 * scroll position, and anything measuring it independently reads a stale value
 * and drifts a frame behind the pin.
 */

/*
 * Ramped numbers are kept to durations and counts (the spec strip), never to
 * anything a reader could act on as a commitment. requestAnimationFrame is
 * suspended while a tab is in the background, so any ramp can stall part-way
 * and leave a WRONG number on screen — a "< 50 ms" latency claim where the
 * page means "< 500 ms". A stalled animation is a cosmetic problem; a stalled
 * claim is a false statement. The motion budget goes on the meter, the reveals
 * and the rail instead.
 */

/* ── The meter ──────────────────────────────────────────────────────────────
   This page's signature. It runs one call at 6× real time so a visitor can
   watch what the agent does with it — who is speaking, how fast it comes back,
   and what lands when the call ends. It used to drain a wallet in rupees; it
   carries no money now, by design (see the header note). */

/** Deterministic tape: who is speaking and how loudly over one 150s call. Fixed
 *  rather than random so the shape is designed, and so it does not re-roll on
 *  every render. */
const TAPE = [
  ['caller', 0.5], ['caller', 0.8], ['caller', 0.4],
  ['agent', 0.6], ['agent', 0.95], ['agent', 0.7], ['agent', 0.85], ['agent', 0.45],
  ['caller', 0.7], ['caller', 0.95], ['caller', 0.55], ['caller', 0.3],
  ['agent', 0.8], ['agent', 0.55], ['agent', 0.9], ['agent', 0.65],
  ['caller', 0.35], ['caller', 0.6],
  ['agent', 0.75], ['agent', 1], ['agent', 0.6], ['agent', 0.8], ['agent', 0.5], ['agent', 0.7],
  ['caller', 0.9], ['caller', 0.5],
  ['agent', 0.65], ['agent', 0.85], ['agent', 0.55],
  ['caller', 0.75], ['caller', 0.4], ['caller', 0.65],
  ['agent', 0.9], ['agent', 0.6], ['agent', 0.8], ['agent', 0.45], ['agent', 0.7],
  ['caller', 0.55], ['caller', 0.85],
  ['agent', 0.7], ['agent', 0.5], ['agent', 0.9], ['agent', 0.6], ['agent', 0.75], ['agent', 0.4], ['agent', 0.6],
] as const;

const CALL_SECONDS = 150;

/** The waveform. Memoised on the integer bar index so it re-renders ~46 times
 *  over a call instead of on every tick — otherwise the meter repaints 46 nodes
 *  ten times a second, forever, on a marketing page. */
const CallTape = memo(function CallTape({ spokenBars }: { spokenBars: number }) {
  return (
    <div className="lp-tape" aria-hidden="true">
      {TAPE.map(([who, level], i) => {
        const spoken = i < spokenBars;
        return (
          <span
            key={i}
            className="lp-tape-bar"
            data-who={who}
            data-spoken={spoken}
            // The four bars behind the playhead are "live" and breathe; the one
            // at the playhead is lifted, so the eye follows the call.
            data-live={spoken && i > spokenBars - 5}
            data-head={i === spokenBars - 1}
            style={{ height: `${12 + level * 40}px`, ['--i' as string]: i }}
          />
        );
      })}
    </div>
  );
});

function CallMeter() {
  const [elapsed, setElapsed] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) { setElapsed(CALL_SECONDS); return; }

    // 6× real time: a 2m30s call plays in 25s. Ticking at 100ms still reads as
    // counting rather than stepping, at half the work of 50ms.
    let timer = 0;
    let onScreen = true;
    const start = () => {
      if (timer) return;
      timer = window.setInterval(() => {
        setElapsed((prev) => (prev >= CALL_SECONDS + 18 ? 0 : prev + 0.6));
      }, 100);
    };
    const stop = () => { window.clearInterval(timer); timer = 0; };
    // One gate for both reasons to pause: scrolled past, or tab in the
    // background. Re-evaluated rather than one-way, so returning to the tab
    // restarts the meter instead of leaving it frozen mid-call.
    const sync = () => (onScreen && !document.hidden ? start() : stop());

    const observer = new IntersectionObserver(
      ([entry]) => { onScreen = entry.isIntersecting; sync(); },
      { threshold: 0.15 },
    );
    if (hostRef.current) observer.observe(hostRef.current);

    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const onCall = Math.min(elapsed, CALL_SECONDS);
  const ended = elapsed >= CALL_SECONDS;
  const spokenBars = Math.round((onCall / CALL_SECONDS) * TAPE.length);
  // Whoever the playhead is sitting on. Before the first bar nobody has spoken
  // yet, so the call reads as connecting rather than as the agent talking.
  const speaking = spokenBars > 0 ? TAPE[Math.min(spokenBars, TAPE.length) - 1][0] : null;

  return (
    <div className="lp-meter" ref={hostRef}>
      <div className="lp-meter-head">
        <span className="lp-meter-live">
          {!ended && <span className="lp-dot" aria-hidden="true" />}
          {ended ? 'Call ended' : 'On a call'}
        </span>
        <span className="lp-meter-clock lp-num">{clock(onCall)}</span>
      </div>

      {/* Teal is the agent, slate is the caller. Decorative — the readouts
          below carry the information. */}
      <CallTape spokenBars={spokenBars} />

      {/* These rows used to be the wallet: a balance, a rate and a running
          debit. No figure a visitor could mistake for a quote goes here now —
          the readouts describe what the agent is doing with the call. */}
      <div className="lp-meter-rows">
        <div className="lp-meter-row">
          <span className="lp-meter-k">Right now</span>
          <span className="lp-meter-v lp-meter-v--lead">
            {ended ? 'Wrapped up' : speaking === 'agent' ? 'Answering' : speaking === 'caller' ? 'Listening' : 'Connecting'}
          </span>
        </div>
        {/* Same bar, now filling with the call rather than draining a balance. */}
        <div className="lp-meter-drain" aria-hidden="true">
          <i style={{ ['--fill' as string]: onCall / CALL_SECONDS }} />
        </div>
        {/* No latency row here: the spec strip beside this card already makes
            the < 500 ms claim, and making it twice on one screen reads as
            padding rather than emphasis. */}
        <div className="lp-meter-row">
          <span className="lp-meter-k">On hang-up</span>
          <span className="lp-meter-v lp-meter-v--accent">
            {ended ? 'Summary delivered' : 'Recording'}
          </span>
        </div>
      </div>

      <p className="lp-meter-foot">One call, played at six times speed.</p>
    </div>
  );
}

/* ── Small animated pieces ─────────────────────────────────────────────── */

/** Splits a headline into words that rise into place one after another.
 *
 *  Word gaps come from margin-right on .lp-word, not from space characters. A
 *  space between two inline-blocks can be broken before (leaving a stray indent
 *  at the start of a wrapped line), and a space INSIDE one is stripped as
 *  trailing whitespace, running the words together. A margin is neither. */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span
          className="lp-word"
          key={word + '-' + i}
          style={{ ['--d' as string]: (from + i) * 45 + 'ms' }}
        >
          {word}
        </span>
      ))}
    </>
  );
}

/** Seamless loop: the track holds the row twice and slides exactly one copy. */
function Marquee({ items, speed = 34, reverse = false }: {
  items: React.ReactNode[]; speed?: number; reverse?: boolean;
}) {
  return (
    <div className={`lp-marquee${reverse ? ' lp-marquee--rev' : ''}`}>
      {[false, true].map((clone) => (
        <div
          key={String(clone)}
          className="lp-marquee-track"
          data-clone={clone}
          aria-hidden={clone}
          style={{ ['--speed' as string]: `${speed}s` }}
        >
          {items}
        </div>
      ))}
    </div>
  );
}

/* ── Page content ───────────────────────────────────────────────────────── */

/* The rail is a call, and only a call — four beats, in the order they happen.
   The Q&A used to hang off the end of it as a fifth "beat", which is where the
   device started lying: nothing happens at that point in a call. The FAQ is
   therefore not a beat and not in sectionRefs, so the rail holds on Handoff
   while the reader is in it rather than un-lighting itself. */
const BEATS = [
  { tc: '00:00', beat: 'Incoming' },
  { tc: '00:02', beat: 'Greeting' },
  { tc: '00:20', beat: 'Working' },
  { tc: '01:45', beat: 'Handoff' },
];

/* One line each, deliberately. The old bodies ran to three clauses and the grid
   read as documentation; a caller-facing capability needs to be recognised, not
   explained, and the detail belongs on the solution pages. */
const SERVICES = [
  { icon: CalendarCheck, title: 'Books appointments', body: 'Real open slots from your calendar, confirmed on the call.' },
  { icon: Filter, title: 'Qualifies leads', body: 'Your questions, scored, straight into the CRM.' },
  { icon: IndianRupee, title: 'Chases payments', body: 'Reminder and collection calls, within the limits you set.' },
  { icon: HeadphonesIcon, title: 'Answers support', body: 'The repeat questions, from your own documents.' },
  { icon: Send, title: 'Runs campaigns', body: 'Upload a list and dial the file, with live outcomes.' },
  { icon: PhoneForwarded, title: 'Hands to a person', body: 'Warm transfer, with everything it has already learned.' },
];

const CHANNELS = [
  { icon: Phone, label: 'Inbound phone' },
  { icon: PhoneForwarded, label: 'Outbound phone' },
  { icon: Mic, label: 'Web call widget' },
  { icon: MessageSquare, label: 'Chat & WhatsApp' },
  { icon: Radio, label: 'Your SIP trunk' },
  { icon: Webhook, label: 'REST API' },
];

const HANDOFF = [
  { k: 'Recorded', body: 'Audio and a timestamped transcript.' },
  { k: 'Summarised', body: 'What was asked, agreed, and how it ended.' },
  { k: 'Extracted', body: 'The fields you named, as data.' },
  { k: 'Delivered', body: 'Pushed where your team already works.' },
];

/* One row, not two. The second row was the same idea again at half the reading
   speed — a marquee is texture, and two of them start to read as a list. */
const DESTINATIONS = [
  'Google Sheets', 'Google Calendar', 'Cal.com', 'Salesforce', 'HubSpot', 'Slack',
  'WhatsApp', 'Twilio', 'Zapier', 'n8n', 'Webhook', 'Email',
];

/* Wordmarks rather than images: the /logos/* files the old page pointed at do
   not exist in client/public, so every one rendered as a broken-image icon.
   Drop real assets there and swap these back to <img>. */
const PARTNERS = ['Capgemini', 'Exotel', 'NVIDIA Inception', 'MG Motor', 'Cipla'];

/* Five, not eight, and two sentences each. An FAQ is where a landing page goes
   to hide its documentation; anything that needs a third sentence belongs in
   the docs or in a conversation. */
const FAQ = [
  {
    q: 'What am I charged for?',
    a: 'Talk-minutes only, covering recognition, the model, the voice and the phone line. No seats, no monthly minimum, nothing to cancel.',
  },
  {
    q: 'How do I see the rate?',
    a: 'It is in Billing the moment you have an account, before you load anything. Or tell us your volume and we will walk you through it.',
  },
  {
    q: 'How long does it take to build one?',
    a: 'Under five minutes to something that answers. Describe the job, pick a voice, test it in the browser.',
  },
  {
    q: 'Which languages does it speak?',
    a: 'Hindi, Tamil, Telugu, Marathi and Bengali alongside English, Spanish and Japanese. Clone a voice from a short sample and it speaks in that.',
  },
  {
    q: 'Can I keep my number and carrier?',
    a: 'Yes. Buy a number here, port the one you have, or connect your own telephony over SIP.',
  },
];

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [lit, setLit] = useState(false);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HeroCanvasHandle>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  /* The hero canvas gates the scroll rig: pins and scrubs are not created
     until it can paint any frame without stalling, so the first scroll after
     load is never the one that hitches. */
  const [canvasReady, setCanvasReady] = useState(false);
  const onCanvasReady = useCallback(() => setCanvasReady(true), []);

  const scroll = useSmoothScroll();
  const { activeBeat, enabled: motionEnabled } = useLandingMotion({
    rootRef: pageRef,
    heroRef,
    canvasRef,
    sectionRefs,
    ready: canvasReady,
  });

  /* Hero load choreography — flipping this class starts the word-by-word rise.
     A timer rather than requestAnimationFrame: rAF is suspended while a tab is
     in the background, so a page opened in a background tab (ctrl-click, a
     restored session) would sit at opacity 0 with its headline invisible until
     focused. Timers still fire, so the hero is always resolved. 40ms is enough
     for the initial transform to paint first, which is what makes it animate at
     all. */
  useEffect(() => {
    const id = window.setTimeout(() => setLit(true), 40);
    return () => window.clearTimeout(id);
  }, []);

  const toggleFaq = useCallback((i: number) => setOpenFaq((cur) => (cur === i ? null : i)), []);

  /* Cursor spotlight. Writing the pointer position onto the card as percentages
     keeps the effect in CSS — no re-render per mousemove. */
  const trackPointer = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - box.left) / box.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - box.top) / box.height) * 100}%`);
  }, []);

  /* Rail clicks go through Lenis so the jump eases the same way the page
     scrolls, and so ScrollTrigger stays in sync with it. The offset clears the
     sticky navbar, which would otherwise cover the section's stamp. */
  const jumpToBeat = (i: number) => {
    const section = sectionRefs.current[i];
    if (section) scroll.current.scrollTo(section, -(stickyHeaderHeight() + 16));
  };

  const setSection = (i: number) => (el: HTMLElement | null) => { sectionRefs.current[i] = el; };

  /* lp-motion is rendered from state rather than added by the scroll rig with
     classList: React rewrites className whenever this prop changes, and lp-lit
     flipping ~40ms after mount was silently dropping the imperatively added
     class — taking the pinned hero's sizing with it. */
  return (
    <div
      className={`lp${lit ? ' lp-lit' : ''}${motionEnabled ? ' lp-motion' : ''}`}
      ref={pageRef}
    >

      {/* Fixed rail — a scrubber for the call the page describes. */}
      <nav className="lp-timeline" aria-label="Page sections">
        {BEATS.map((b, i) => (
          <button
            key={b.tc}
            type="button"
            className={`lp-tl-item${i === activeBeat ? ' is-active' : ''}${i < activeBeat ? ' is-done' : ''}`}
            onClick={() => jumpToBeat(i)}
            aria-current={i === activeBeat ? 'true' : undefined}
          >
            <span className="lp-tl-dot" aria-hidden="true" />
            {/* Beat name only. The full "00:20 · Working" stamp lives in the
                section itself; repeating it here runs the label into the
                headline at the narrower end of the rail's width range. */}
            <span className="lp-tl-label">{b.beat}</span>
          </button>
        ))}
      </nav>

      {/* ═══ 00:00 — the call connects ═══ */}
      <section
        className="lp-hero"
        data-beat
        ref={(el) => { sectionRefs.current[0] = el; heroRef.current = el; }}
      >
        <div className="lp-aurora" aria-hidden="true"><span /><span /><span /></div>

        {/* The scroll-scrubbed call. Sits above the aurora and below the copy;
            it masks itself out from underneath the headline so contrast never
            depends on where the scrub happens to be. */}
        <HeroCanvas ref={canvasRef} onReady={onCanvasReady} />

        <div className="lp-wrap">
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-hero-tag lp-reveal" style={{ ['--d' as string]: '80ms' }}>
                <span className="lp-dot" aria-hidden="true" />
                Pay per talk-minute · no monthly plan
              </span>

              <h1 className="lp-h1">
                <Words text="A voice agent that picks up every call, and bills you" />
                <em><Words text="only for the minutes it talks." from={11} /></em>
              </h1>

              <p className="lp-lede lp-reveal" style={{ ['--d' as string]: '620ms' }}>
                Describe the job, pick a voice, point a number at it. Charged for
                talk-minutes only.
              </p>

              <div className="lp-cta-row lp-reveal" style={{ ['--d' as string]: '720ms' }}>
                <Link to="/signup" className="lp-btn lp-btn--fill">Build an agent free</Link>
                <Link to="/book-appointment" className="lp-btn lp-btn--ghost">Hear one live</Link>
              </div>

              {/* The only ramped figures on the page — durations and counts;
                  see the count-up note in useLandingMotion for why a ramp is
                  never allowed on anything a reader could hold us to. The
                  rendered text is the final value, so a reader who never
                  scrolls, or who has motion off, still reads the right number. */}
              <div className="lp-specs lp-reveal" style={{ ['--d' as string]: '820ms' }}>
                <div className="lp-spec">
                  <span className="lp-spec-v">
                    &lt;&nbsp;<span data-countup="500">500</span>&nbsp;ms
                  </span>
                  <span className="lp-spec-k">Reply latency on a live call</span>
                </div>
                <div className="lp-spec">
                  <span className="lp-spec-v">
                    <span data-countup="24">24</span>&nbsp;×&nbsp;7
                  </span>
                  <span className="lp-spec-k">Inbound, outbound and campaigns</span>
                </div>
                <div className="lp-spec">
                  <span className="lp-spec-v">
                    <span data-countup="5">5</span>&nbsp;min
                  </span>
                  <span className="lp-spec-k">From a prompt to a working agent</span>
                </div>
              </div>
            </div>

            <CallMeter />
          </div>
        </div>
      </section>

      {/* Proof strip — a slow drift, paused on hover. */}
      <div className="lp-trust">
        <span className="lp-trust-label">Building with</span>
        <Marquee
          speed={40}
          items={PARTNERS.map((name) => (
            <span className="lp-trust-name" key={name}>{name}</span>
          ))}
        />
      </div>

      {/* ═══ 00:02 — it has to sound like a person first ═══ */}
      <section className="lp-sec" data-beat ref={setSection(1)}>
        {/* Scrubbed curtain across the seam. A scaleY on a gradient, so the
            transition between sections is compositor work, not a repaint. */}
        <i className="lp-wipe" aria-hidden="true" />
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">00:02</span>
              <span className="lp-stamp-beat">Greeting</span>
            </span>
            <h2 className="lp-h2">First it has to sound like a person.</h2>
            <p className="lp-lede">
              Callers hang up on anything that stalls or talks over them.
            </p>
          </div>

          {/* Three rows, one sentence each. This section used to argue its case
              four times over; the metric column is the argument, and the line
              beside it only has to land the idea. */}
          <div className="lp-beats">
            {[
              {
                metric: '<500', unit: 'ms reply',
                title: 'It starts speaking before it has finished thinking',
                body: 'Speech, model and voice stream together, so there is no dead air where a caller wonders whether the line dropped.',
              },
              {
                metric: '2-way', unit: 'turn taking',
                title: 'Interrupt it and it stops mid-sentence',
                body: 'It yields the way a person does, and holds its turn through a cough or a half-second pause.',
              },
              {
                metric: 'Yours', unit: 'knowledge',
                title: 'It answers from your documents, not from guesswork',
                body: 'Upload your price lists and policies, and it says it does not know rather than inventing something.',
              },
            ].map((row, i) => (
              <div
                className="lp-beat-item lp-reveal lp-reveal--x"
                key={row.title}
                style={{ ['--d' as string]: `${i * 90}ms` }}
              >
                <div className="lp-beat-metric">
                  {row.metric}
                  <small>{row.unit}</small>
                </div>
                <div className="lp-beat-text">
                  <h3 className="lp-h3">{row.title}</h3>
                  <p className="lp-p">{row.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 00:20 — the work ═══ */}
      {/* Pinned where the viewport is tall enough to hold it — see the
          [data-pin-section] note in useLandingMotion. */}
      <section className="lp-sec" data-beat data-pin-section ref={setSection(2)}>
        <i className="lp-wipe" aria-hidden="true" />
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">00:20</span>
              <span className="lp-stamp-beat">Working</span>
            </span>
            <h2 className="lp-h2">Then it does the job you hired it for.</h2>
            <p className="lp-lede">
              Not a menu tree with a nicer voice — it acts in your systems while the
              caller is still on the line.
            </p>
          </div>

          {/* Deliberately not .lp-reveal: the cards are dealt in individually
              by the pin's scrubbed stagger, and a container fade on top of
              that would animate the same pixels twice. */}
          <div className="lp-cards" data-pin-body>
            {SERVICES.map((s) => (
              <div className="lp-card" key={s.title} onMouseMove={trackPointer}>
                <span className="lp-card-icon"><s.icon size={18} /></span>
                <h3 className="lp-h3">{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>

          <div className="lp-reveal" style={{ marginTop: 34 }}>
            <p className="lp-eyebrow">Reachable on</p>
            <div className="lp-channels">
              {CHANNELS.map((c, i) => (
                <span
                  className="lp-channel lp-reveal"
                  key={c.label}
                  style={{ ['--d' as string]: `${i * 70}ms` }}
                >
                  <c.icon size={14} /> {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 01:45 — the handoff ═══ */}
      <section className="lp-sec" data-beat ref={setSection(3)}>
        <i className="lp-wipe" aria-hidden="true" />
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">01:45</span>
              <span className="lp-stamp-beat">Handoff</span>
            </span>
            <h2 className="lp-h2">And hands the call off clean.</h2>
            <p className="lp-lede">
              Every call lands where your team already works, seconds after it ends.
            </p>
          </div>

          <div className="lp-flow">
            {HANDOFF.map((step, i) => (
              <div
                className="lp-flow-step lp-reveal"
                key={step.k}
                style={{ ['--i' as string]: i, ['--d' as string]: `${i * 90}ms` }}
              >
                <span className="lp-flow-k">{step.k}</span>
                <p className="lp-p">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="lp-dest-rows lp-reveal">
            <Marquee speed={48} items={DESTINATIONS.map((d) => (
              <span className="lp-dest-item" key={d}>{d}</span>
            ))} />
          </div>
        </div>
      </section>

      {/* A "Settle — the wallet" section used to sit here: the live per-minute
          rate, a monthly estimator and a top-up footnote. It is gone on purpose
          (see the header note) — the anchor, the beat and the pin went with it.
          Pricing is a conversation now, and /contact is where it happens. */}

      {/* ═══ Questions ═══ */}
      {/* No data-beat and no ref: see the note on BEATS. */}
      <section className="lp-sec">
        <i className="lp-wipe" aria-hidden="true" />
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">Q&amp;A</span>
              <span className="lp-stamp-beat">Before you start</span>
            </span>
            <h2 className="lp-h2">Questions people ask first.</h2>
          </div>

          <div className="lp-faq lp-reveal">
            {FAQ.map((item, i) => (
              <div className="lp-faq-item" key={item.q}>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={openFaq === i}
                  aria-controls={`lp-faq-a-${i}`}
                  id={`lp-faq-q-${i}`}
                  onClick={() => toggleFaq(i)}
                >
                  {item.q}
                  <span className="lp-faq-icon" aria-hidden="true"><Plus size={15} /></span>
                </button>
                {/* Always mounted so the open/close height can animate — the
                    grid row collapses to 0fr. `hidden` would set display:none
                    and there would be nothing to animate, so the collapsed
                    state is marked with aria-hidden instead. It holds no
                    focusable content, so nothing is stranded in the tab order. */}
                <div
                  className={`lp-faq-a${openFaq === i ? ' is-open' : ''}`}
                  id={`lp-faq-a-${i}`}
                  role="region"
                  aria-labelledby={`lp-faq-q-${i}`}
                  aria-hidden={openFaq !== i}
                >
                  <div><p className="lp-p">{item.a}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Close ═══ */}
      <section className="lp-close">
        <i className="lp-wipe" aria-hidden="true" />
        <div className="lp-wrap lp-close-inner">
          <p className="lp-eyebrow lp-reveal">Ready when you are</p>
          <h2 className="lp-h2 lp-reveal" style={{ ['--d' as string]: '80ms' }}>
            Put an agent on your busiest number.
          </h2>
          <p className="lp-lede lp-reveal" style={{ ['--d' as string]: '160ms' }}>
            Build it free and test it in the browser. Put money behind it when it is
            ready for real calls.
          </p>
          <div className="lp-cta-row lp-reveal" style={{ ['--d' as string]: '240ms' }}>
            <Link to="/signup" className="lp-btn lp-btn--fill">Build an agent free</Link>
            <Link to="/book-appointment" className="lp-btn lp-btn--ghost">Book a walkthrough</Link>
          </div>
          {/* Where the price went. Someone who scrolled this far and still wants
              a number gets a person, not a figure they have to interpret alone. */}
          <p className="lp-p lp-reveal" style={{ ['--d' as string]: '320ms', marginTop: 18 }}>
            Want the numbers? Tell us the volume you expect and we will price it with you —{' '}
            <Link to="/contact" style={{ color: 'var(--teal-fg)' }}>talk to us</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
