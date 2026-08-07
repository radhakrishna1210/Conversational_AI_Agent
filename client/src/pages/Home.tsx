import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck, Check, Filter, Globe, HeadphonesIcon, IndianRupee, MessageSquare,
  Mic, Phone, PhoneForwarded, Plus, Radio, Send, Wallet, Webhook,
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
   call you have scrolled, and the page ends where a call ends — at the wallet.
   There is no monthly plan on this page, only a rate per talk-minute.

   There is one price: rupees per talk-minute, from GET /config/wallet-rate.
   That is the same value settlement deducts and the same value Super Admin →
   Wallet Rate sets, so the advertised rate and the charged rate cannot drift
   apart. Nothing is hardcoded, and when the endpoint is unreachable the page
   says so rather than falling back to an invented figure.

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

   Prices are never animated — see the note above useWalletRate.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The one number this page is about: rupees per talk-minute, deducted from the
 * wallet. Served by GET /config/wallet-rate and set in Super Admin -> Wallet
 * Rate. There are no plans and no tiers — the same rate applies to everyone,
 * and it is the same value settlement charges, so the page cannot advertise a
 * price the wallet does not take.
 *
 * null means "not loaded yet"; the page says so rather than inventing a figure.
 */
type WalletRate = number | null;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rupees = (amount: number, digits = 2) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);

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
 * There is deliberately no number-ramp helper on this page.
 *
 * Every figure here is a price: the spec strip, the per-minute rate, and the
 * estimator total. requestAnimationFrame is suspended while a tab is in the
 * background, so any ramp can stall part-way and leave a WRONG number on
 * screen — a "< 50 ms" latency claim, or an estimator reading ₹0 for a product
 * that costs money. A stalled animation is a cosmetic problem; a stalled price
 * is a false statement. Prices render exact and instant; the motion budget is
 * spent on the meter, the reveals and the rail instead.
 */

/* ── The rate ───────────────────────────────────────────────────────────── */

/** undefined while in flight, null if the endpoint could not be reached. */
function useWalletRate(): WalletRate | undefined {
  const [rate, setRate] = useState<WalletRate | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetch('/api/v1/config/wallet-rate')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const value = Number(d?.perMinuteInr);
        setRate(Number.isFinite(value) && value > 0 ? value : null);
      })
      .catch(() => live && setRate(null));
    return () => { live = false; };
  }, []);

  return rate;
}

/* ── The meter ──────────────────────────────────────────────────────────────
   This page's signature. It runs a call at 6× real time and drains a wallet at
   the entry rate, because that is the whole pricing model and it is faster to
   watch than to read. */

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
const OPENING_BALANCE = 1000;

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

function CallMeter({ rate }: { rate: number | null }) {
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
  const spent = rate == null ? 0 : (onCall / 60) * rate;
  const ended = elapsed >= CALL_SECONDS;
  const spokenBars = Math.round((onCall / CALL_SECONDS) * TAPE.length);

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

      <div className="lp-meter-rows">
        <div className="lp-meter-row">
          <span className="lp-meter-k">Wallet</span>
          <span className="lp-meter-v lp-meter-v--balance">{rupees(OPENING_BALANCE - spent)}</span>
        </div>
        <div className="lp-meter-drain" aria-hidden="true">
          <i style={{ ['--fill' as string]: spent / OPENING_BALANCE }} />
        </div>
        <div className="lp-meter-row">
          <span className="lp-meter-k">Rate</span>
          <span className="lp-meter-v">{rate == null ? '—' : `${rupees(rate)} / min`}</span>
        </div>
        <div className="lp-meter-row">
          <span className="lp-meter-k">This call</span>
          <span className="lp-meter-v lp-meter-v--spend">{rate == null ? '—' : `− ${rupees(spent)}`}</span>
        </div>
      </div>

      <p className="lp-meter-foot">
        Running at the rate a new workspace starts on. Top up any amount, spend it on
        talk-minutes, and stop whenever you like.
      </p>
    </div>
  );
}

/* ── Estimator ─────────────────────────────────────────────────────────────
   Answers the only question a wallet model leaves open: how long does a top-up
   last me? */

function Estimator({ rate }: { rate: number | null }) {
  const [callsPerDay, setCallsPerDay] = useState(120);
  const [minutesPerCall, setMinutesPerCall] = useState(3);

  const minutesPerMonth = callsPerDay * minutesPerCall * 30;
  const monthly = rate == null ? null : minutesPerMonth * rate;

  return (
    <div className="lp-est">
      <div className="lp-est-fields">
        <div className="lp-field">
          <label className="lp-field-label" htmlFor="lp-calls">
            Calls a day <b className="lp-num">{callsPerDay}</b>
          </label>
          <input
            id="lp-calls" className="lp-range" type="range" min={10} max={2000} step={10}
            value={callsPerDay} onChange={(e) => setCallsPerDay(Number(e.target.value))}
          />
        </div>
        <div className="lp-field">
          <label className="lp-field-label" htmlFor="lp-mins">
            Minutes a call <b className="lp-num">{minutesPerCall}</b>
          </label>
          <input
            id="lp-mins" className="lp-range" type="range" min={1} max={15} step={1}
            value={minutesPerCall} onChange={(e) => setMinutesPerCall(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="lp-est-out">
        <div>
          <div className="lp-est-total">{monthly == null ? '—' : rupees(monthly, 0)}</div>
          <p className="lp-est-sub">A month at this volume, at the rate above.</p>
        </div>
        <p className="lp-est-sub lp-num" style={{ textAlign: 'right' }}>
          {minutesPerMonth.toLocaleString('en-IN')} talk-minutes
          <br />
          {monthly == null ? '' : `${rupees(monthly / 30, 0)} a day`}
        </p>
      </div>
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

const BEATS = [
  { tc: '00:00', beat: 'Incoming' },
  { tc: '00:02', beat: 'Greeting' },
  { tc: '00:20', beat: 'Working' },
  { tc: '01:45', beat: 'Handoff' },
  { tc: 'Settle', beat: 'The wallet' },
  { tc: 'Q&A', beat: 'Before you start' },
];

const SERVICES = [
  { icon: CalendarCheck, title: 'Books appointments', body: 'Offers real open slots from Google Calendar or Cal.com, confirms, and writes the booking back before the caller hangs up.' },
  { icon: Filter, title: 'Qualifies leads', body: 'Asks your qualifying questions, scores the answer, and drops a clean record into Sheets, Salesforce or HubSpot.' },
  { icon: IndianRupee, title: 'Chases payments', body: 'Runs reminder and collection calls, negotiates within the limits you set, and flags anyone who asks for a human.' },
  { icon: HeadphonesIcon, title: 'Answers support calls', body: 'Handles the repeat questions from your own documents around the clock, and escalates the ones it should not guess at.' },
  { icon: Send, title: 'Runs outbound campaigns', body: 'Upload a list, pick an agent, and dial the whole file with live progress, per-call outcomes and retry handling.' },
  { icon: PhoneForwarded, title: 'Transfers to a person', body: 'Warm-transfers to your team when a call needs judgment, and passes across what it has already learned.' },
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
  { k: 'Recorded', body: 'Audio and a timestamped transcript, searchable in call logs.' },
  { k: 'Summarised', body: 'What was asked, what was agreed, and how the call ended.' },
  { k: 'Extracted', body: 'The fields you named — name, budget, slot, outcome — as data.' },
  { k: 'Delivered', body: 'Pushed to the tools below, filtered by outcome if you want.' },
];

const DESTINATIONS_TOP = ['Google Sheets', 'Google Calendar', 'Google Meet', 'Cal.com', 'Calendly', 'Salesforce', 'HubSpot', 'Slack'];
const DESTINATIONS_BOTTOM = ['WhatsApp', 'Twilio', 'Genesys', 'Make', 'n8n', 'Zapier', 'Webhook', 'Email'];

/* Wordmarks rather than images: the /logos/* files the old page pointed at do
   not exist in client/public, so every one rendered as a broken-image icon.
   Drop real assets there and swap these back to <img>. */
const PARTNERS = ['Capgemini', 'Exotel', 'NVIDIA Inception', 'MG Motor', 'Cipla'];

const FAQ = [
  {
    q: 'What exactly am I charged for?',
    a: 'Talk-minutes. The meter starts when the call connects and stops when it ends, and the rate covers the whole pipeline — speech recognition, the language model, the voice, and the phone line. There is no seat fee, no monthly minimum, and nothing to cancel.',
  },
  {
    q: 'Is there a monthly plan?',
    a: 'No. You load a wallet and spend it, at one rate that is the same for every account whatever your volume. You are never on a subscription, and unused balance is not swept at the end of a month.',
  },
  {
    q: 'How do I top up?',
    a: 'From Billing in your dashboard, by card or UPI. Pick any amount — there are no fixed recharge packs. Your balance and every debit are itemised in the wallet ledger, one line per call.',
  },
  {
    q: 'What happens when my balance runs out?',
    a: 'New calls stop being placed or answered, and you get a low-balance warning before that point. Calls already in progress finish normally. Top up and the agents resume immediately.',
  },
  {
    q: 'How long does it take to build an agent?',
    a: 'Under five minutes for a working one. Describe the job in plain language, pick a voice, and test it in the browser. Refining the script, adding your documents and wiring integrations is where the real time goes.',
  },
  {
    q: 'Which languages does it speak?',
    a: 'Hindi, Tamil, Telugu, Marathi, Bengali and other Indian languages alongside English, Spanish, Japanese and more. You can also clone a voice from a short sample and use it as the agent.',
  },
  {
    q: 'Can I bring my own phone number or carrier?',
    a: 'Yes. Buy an Indian or US number inside the platform, port an existing business number, or connect your own telephony over SIP and keep your current carrier and routing.',
  },
  {
    q: 'What do I get after a call?',
    a: 'A recording, a full transcript, a summary, and the fields you asked the agent to collect — delivered to a spreadsheet, a CRM, a webhook or your inbox, and visible in call logs and analytics.',
  },
];

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function Home() {
  const rate = useWalletRate();
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
  const activeBeat = useLandingMotion({
    rootRef: pageRef,
    heroRef,
    canvasRef,
    sectionRefs,
    ready: canvasReady,
    // The rate arriving swaps "Loading…" for a price and a note, which changes
    // the page height and therefore every measured start and end below it.
    layoutKey: rate,
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

  return (
    <div className={`lp${lit ? ' lp-lit' : ''}`} ref={pageRef}>

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
                Wallet billing · no monthly plan
              </span>

              <h1 className="lp-h1">
                <Words text="A voice agent that picks up every call, and bills you" />
                <em><Words text="only for the minutes it talks." from={11} /></em>
              </h1>

              <p className="lp-lede lp-reveal" style={{ ['--d' as string]: '620ms' }}>
                Describe the job, pick a voice, point a number at it. Your wallet is
                charged per talk-minute — no seats, no monthly plan, nothing to cancel.
              </p>

              <div className="lp-cta-row lp-reveal" style={{ ['--d' as string]: '720ms' }}>
                <Link to="/signup" className="lp-btn lp-btn--fill">Build an agent free</Link>
                <Link to="/book-appointment" className="lp-btn lp-btn--ghost">Hear one live</Link>
              </div>

              {/* The only ramped figures on the page. These are durations and
                  counts, not money — see the count-up note in useLandingMotion
                  for why no rupee value here is ever animated. The rendered
                  text is the final value, so a reader who never scrolls, or
                  who has motion turned off, still reads the right number. */}
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

            <CallMeter rate={rate ?? null} />
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
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">00:02</span>
              <span className="lp-stamp-beat">Greeting</span>
            </span>
            <h2 className="lp-h2">First it has to sound like a person.</h2>
            <p className="lp-lede">
              Callers hang up on anything that stalls, talks over them, or reads a menu.
              Four things decide whether they stay on the line.
            </p>
          </div>

          <div className="lp-beats">
            {[
              {
                metric: '<500', unit: 'ms reply',
                title: 'It starts speaking before it has finished thinking',
                body: 'Speech, model and voice all stream. The first words go out while the rest of the sentence is still being generated, so there is no dead air where a caller wonders whether the line dropped.',
              },
              {
                metric: '2-way', unit: 'turn taking',
                title: 'Interrupt it and it stops mid-sentence',
                body: 'Talk over the agent and it yields, the way a person does. It also holds its turn through "umm", a cough or a half-second pause instead of treating every gap as its cue to start.',
              },
              {
                metric: 'Indic', unit: '+ global',
                title: 'It answers in the language the caller opened with',
                body: 'Hindi, Tamil, Telugu, Marathi and Bengali alongside English, Spanish and Japanese. Clone a voice from a short sample and the agent speaks in it.',
              },
              {
                metric: 'Yours', unit: 'knowledge',
                title: 'It answers from your documents, not from guesswork',
                body: 'Upload price lists, policies and FAQs. The agent answers out of them, and says it does not know rather than inventing something you will have to apologise for later.',
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
      <section className="lp-sec" data-beat ref={setSection(2)}>
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">00:20</span>
              <span className="lp-stamp-beat">Working</span>
            </span>
            <h2 className="lp-h2">Then it does the job you hired it for.</h2>
            <p className="lp-lede">
              Not a menu tree with a nicer voice. The agent takes actions in your systems
              while the caller is still on the line.
            </p>
          </div>

          <div className="lp-cards lp-reveal">
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
        <div className="lp-sec-inner">
          <div className="lp-head lp-reveal">
            <span className="lp-stamp">
              <span className="lp-stamp-tc lp-num">01:45</span>
              <span className="lp-stamp-beat">Handoff</span>
            </span>
            <h2 className="lp-h2">And hands the call off clean.</h2>
            <p className="lp-lede">
              A call your team never hears about is worth nothing. Every one of them
              lands somewhere you already work, within seconds of hanging up.
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
            <Marquee speed={46} items={DESTINATIONS_TOP.map((d) => (
              <span className="lp-dest-item" key={d}>{d}</span>
            ))} />
            <Marquee speed={52} reverse items={DESTINATIONS_BOTTOM.map((d) => (
              <span className="lp-dest-item" key={d}>{d}</span>
            ))} />
          </div>

          <p className="lp-p lp-reveal" style={{ marginTop: 22 }}>
            Plus dashboards for call volume, outcomes, sentiment and spend — and an API and
            webhooks for anything not on this list.
          </p>
        </div>
      </section>

      {/* ═══ SETTLE — the wallet ═══ */}
      <section className="lp-sec" id="pricing" data-beat ref={setSection(4)}>
        <div className="lp-sec-inner">
          <div className="lp-settle">
            <div className="lp-reveal">
              <span className="lp-stamp">
                <span className="lp-stamp-tc lp-num">Settle</span>
                <span className="lp-stamp-beat">The wallet</span>
              </span>
              <h2 className="lp-h2">No plans. Just a balance.</h2>
              <p className="lp-lede" style={{ marginTop: 14 }}>
                Top up your wallet with any amount. Every call debits the minutes it
                actually used, at one all-in rate. Nothing renews, nothing is per seat,
                and there is no tier to outgrow.
              </p>

              <ul className="lp-included">
                <li><Check size={15} /><span>Speech recognition, the language model, the voice and the phone line — all inside the per-minute rate.</span></li>
                <li><Wallet size={15} /><span>Top up by card or UPI, any amount, whenever you want.</span></li>
                <li><Globe size={15} /><span>Every debit itemised in the ledger, one line per call.</span></li>
                <li><Plus size={15} /><span>The same rate whether you run ten calls a month or ten thousand.</span></li>
              </ul>
            </div>

            <div className="lp-reveal">
              {/* The rate, as a single figure. It is the number Super Admin sets
                  and the number settlement deducts — there is nothing else to
                  compare it against, so there is no table. */}
              <div className="lp-price">
                <span className="lp-price-k">Deducted per talk-minute</span>

                {rate === undefined && <span className="lp-price-v">Loading…</span>}

                {rate === null && (
                  <>
                    <span className="lp-price-v">—</span>
                    <p className="lp-price-note">
                      The rate could not be loaded just now. Refresh in a moment, or{' '}
                      <Link to="/contact">ask us directly</Link>.
                    </p>
                  </>
                )}

                {typeof rate === 'number' && (
                  <>
                    <span className="lp-price-v lp-num">
                      {rupees(rate)}<small>/ min</small>
                    </span>
                    <p className="lp-price-note lp-num">
                      A ₹1,000 top-up buys about {Math.floor(1000 / rate).toLocaleString('en-IN')} minutes.
                    </p>
                  </>
                )}
              </div>

              <Estimator rate={rate ?? null} />

              <p className="lp-p" style={{ marginTop: 16, fontSize: 13 }}>
                Rented phone numbers are billed separately at the carrier's monthly rate.
                Running high volume, or need an invoice instead of a wallet?{' '}
                <Link to="/contact" style={{ color: 'var(--teal-fg)' }}>Talk to us</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Questions ═══ */}
      <section className="lp-sec" data-beat ref={setSection(5)}>
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
        <div className="lp-wrap lp-close-inner">
          <p className="lp-eyebrow lp-reveal">Ready when you are</p>
          <h2 className="lp-h2 lp-reveal" style={{ ['--d' as string]: '80ms' }}>
            Put an agent on your busiest number.
          </h2>
          <p className="lp-lede lp-reveal" style={{ ['--d' as string]: '160ms' }}>
            Build it free, test it in the browser, and only load the wallet once you
            want it answering real calls.
          </p>
          <div className="lp-cta-row lp-reveal" style={{ ['--d' as string]: '240ms' }}>
            <Link to="/signup" className="lp-btn lp-btn--fill">Build an agent free</Link>
            <Link to="/book-appointment" className="lp-btn lp-btn--ghost">Book a walkthrough</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
