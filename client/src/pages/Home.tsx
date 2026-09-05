import {
  useState, useRef,
  type FormEvent, type ChangeEvent, type KeyboardEvent, type CSSProperties,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MessageCircle, MessagesSquare, Globe, ShieldCheck, Check,
  Languages, Zap, Radio, Brain, ArrowRight, Plug,
  X, ArrowLeft, Send, Play, Pause, Download, Copy,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import {
  ACCENT, HERO, CHANNELS, HERO_STATS, CONSOLE, PROOF, OMNI, TRUST, BADGES,
  ASK_AI, CTA_BAND, USE_CASE_BUCKETS, USE_CASES, INDUSTRIES, QA, CAPABILITIES,
  INTEGRATIONS, INTEGRATIONS_LINK, BUILDER, FLOW, FAQ, FINAL,
  DIAL_COUNTRIES, TRY_AGENT, SUPPORT_WIDGET, DEMO_CALLS,
  type Bucket, type Channel, type DemoCall,
} from './home/content';
import './Home.css';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LANDING PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A centred, single-column marketing flow: hero (icons → headline → CTA →
 * full-width console), social proof, an omnichannel band, a trust band, a
 * get-started band, use-case tabs, the QA scorecard, a capability grid, the
 * integrations grid, the builder canvas, an FAQ, and a closing CTA.
 *
 * One flat --bg surface the whole way down — section rhythm comes from
 * whitespace, not from alternating panels. Everything is scoped under `.lp`
 * and every colour resolves from the Resonance tokens in styles.css, so the
 * page follows the light/dark toggle with almost no per-theme overrides.
 *
 * No price appears anywhere: this product bills a prepaid balance at one
 * per-minute rate quoted per account (see the header of Pricing.tsx).
 */

const CHANNEL_ICON: Record<Channel['icon'], typeof Phone> = {
  phone: Phone,
  whatsapp: MessageCircle,
  chat: MessagesSquare,
  globe: Globe,
};

const CAPABILITY_ICONS = [Languages, Zap, Radio, Brain];

/** Centred section header: eyebrow + heading + optional intro line. */
function SecHead({ eyebrow, title, intro, violet }: {
  eyebrow: string; title: string; intro?: string; violet?: boolean;
}) {
  return (
    <div className="lp-sechead">
      <div className={`lp-eyebrow${violet ? ' is-violet' : ''}`}>{eyebrow}</div>
      <h2 className="lp-h2">{title}</h2>
      {intro && <p className="lp-p lp-sechead-intro">{intro}</p>}
    </div>
  );
}

type CallStatus = 'idle' | 'submitting' | 'queued' | 'error';

/**
 * The "try an agent" phone box, shared by the hero and the support widget.
 * Submitting only queues client-side (see TRY_AGENT.queuedBody) — the actual
 * outbound-call wiring is a separate, backend-gated piece of work.
 */
function TryAgentForm({ compact }: { compact?: boolean }) {
  const [dial, setDial] = useState(DIAL_COUNTRIES[0].dial);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<CallStatus>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 14) {
      setStatus('error');
      return;
    }
    setStatus('submitting');
    await new Promise((r) => setTimeout(r, 600));
    setStatus('queued');
  }

  return (
    <form className={`lp-tryagent${compact ? ' is-compact' : ''}`} onSubmit={handleSubmit}>
      <div className="lp-tryagent-row">
        <select
          className="lp-tryagent-cc"
          value={dial}
          onChange={(e) => setDial(e.target.value)}
          aria-label="Country code"
        >
          {DIAL_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.dial}>{c.flag} {c.dial}</option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          className="lp-tryagent-input"
          placeholder={TRY_AGENT.placeholder}
          value={phone}
          onChange={(e) => { setPhone(e.target.value); if (status !== 'idle') setStatus('idle'); }}
        />
        <button
          type="submit"
          className="lp-btn lp-btn-primary lp-tryagent-btn"
          disabled={status === 'submitting'}
        >
          <Phone size={15} aria-hidden />
          {status === 'submitting' ? TRY_AGENT.pending : TRY_AGENT.button}
        </button>
      </div>
      {status === 'error' && <p className="lp-tryagent-msg is-error">{TRY_AGENT.errorInvalid}</p>}
      {status === 'queued' && (
        <p className="lp-tryagent-msg is-ok"><Check size={13} aria-hidden /> {TRY_AGENT.queuedBody}</p>
      )}
    </form>
  );
}

type WidgetTab = 'home' | 'chat' | 'call';

/** Floating bottom-right support launcher: a chat stub and the try-an-agent form. */
function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WidgetTab>('home');
  const [chatDraft, setChatDraft] = useState('');

  function toggle() {
    setOpen((o) => !o);
    if (open) setTab('home');
  }

  return (
    <div className="lp-widget">
      {open && (
        <div className="lp-widget-panel" role="dialog" aria-label={SUPPORT_WIDGET.title}>
          <div className="lp-widget-head">
            {tab !== 'home' ? (
              <button type="button" className="lp-widget-back" onClick={() => setTab('home')} aria-label="Back">
                <ArrowLeft size={16} aria-hidden />
              </button>
            ) : <span />}
            <button type="button" className="lp-widget-close" onClick={toggle} aria-label="Close">
              <X size={16} aria-hidden />
            </button>
          </div>

          {tab === 'home' && (
            <div className="lp-widget-home">
              <div className="lp-widget-mark" aria-hidden>{BRAND.name.slice(0, 1)}</div>
              <h3 className="lp-widget-title">{SUPPORT_WIDGET.title}</h3>
              <p className="lp-widget-sub">{SUPPORT_WIDGET.subtitle}</p>
              <div className="lp-widget-actions">
                <button type="button" className="lp-btn lp-btn-secondary lp-btn-block" onClick={() => setTab('chat')}>
                  <MessagesSquare size={15} aria-hidden /> {SUPPORT_WIDGET.chat.label}
                </button>
                <button type="button" className="lp-btn lp-btn-primary lp-btn-block" onClick={() => setTab('call')}>
                  <Phone size={15} aria-hidden /> {SUPPORT_WIDGET.call.label}
                </button>
              </div>
              <p className="lp-widget-disclaimer">{SUPPORT_WIDGET.disclaimer}</p>
            </div>
          )}

          {tab === 'chat' && (
            <div className="lp-widget-chat">
              <div className="lp-widget-chat-log">
                <div className="lp-widget-chat-bubble">{SUPPORT_WIDGET.chat.pendingNotice}</div>
              </div>
              <form
                className="lp-widget-chat-input"
                onSubmit={(e) => { e.preventDefault(); setChatDraft(''); }}
              >
                <input
                  type="text"
                  placeholder={SUPPORT_WIDGET.chat.placeholder}
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  disabled
                />
                <button type="submit" disabled aria-label="Send"><Send size={15} aria-hidden /></button>
              </form>
            </div>
          )}

          {tab === 'call' && (
            <div className="lp-widget-call">
              <p className="lp-widget-sub">{TRY_AGENT.eyebrow}</p>
              <TryAgentForm compact />
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="lp-widget-fab"
        onClick={toggle}
        aria-label={open ? SUPPORT_WIDGET.launcherCloseLabel : SUPPORT_WIDGET.launcherOpenLabel}
      >
        {open ? <X size={22} aria-hidden /> : <Phone size={20} aria-hidden />}
      </button>
    </div>
  );
}

/** `m:ss`, for the player's running clock. */
function fmtClock(sec: number): string {
  const n = Number.isFinite(sec) && sec > 0 ? sec : 0;
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
}

/** `3m 44s`, the way a call log lists a length. */
function fmtLength(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/**
 * The player for one demo call.
 *
 * Mounted under a `key` of the call id, so picking another call in the rail
 * throws this away and starts clean rather than leaking a paused position
 * across recordings.
 *
 * Deliberately not `<audio controls>`: the native widget brings its own
 * chrome, which reads as a foreign object on a page where every other surface
 * is drawn from the Resonance tokens.
 */
function CallPlayer({ call }: { call: DemoCall }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  /* The declared length is authoritative until the element knows better —
     see the note on DemoCall.durationSec. */
  const [total, setTotal] = useState(call.durationSec);
  const probed = useRef(false);
  const rewound = useRef(false);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }

  /*
   * Chrome's MediaRecorder writes no Duration into the WebM header, so the
   * element reports Infinity and the seek bar has nothing to scale against.
   * Seeking far past the end forces a scan of the file; the durationchange
   * that follows carries the real length, and we rewind to the start.
   */
  function handleMeta() {
    const el = ref.current;
    if (!el || probed.current) return;
    probed.current = true;
    if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
    else el.currentTime = 1e101;
  }

  function handleDuration() {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setTotal(el.duration);
    /* Undo the probe's seek, but never a position the visitor chose. */
    if (!rewound.current && el.paused) {
      rewound.current = true;
      el.currentTime = 0;
      setTime(0);
    }
  }

  function seek(e: ChangeEvent<HTMLInputElement>) {
    const el = ref.current;
    const at = Number(e.target.value);
    setTime(at);
    if (el) el.currentTime = at;
  }

  if (!call.audio) {
    return (
      <div className="lp-player is-empty">
        <span className="lp-player-btn is-off" aria-hidden><Play size={16} /></span>
        <span className="lp-player-pending">{QA.noAudio}</span>
      </div>
    );
  }

  const pct = total > 0 ? Math.min(100, (time / total) * 100) : 0;

  return (
    <div className="lp-player">
      <audio
        ref={ref}
        src={call.audio}
        preload="metadata"
        onLoadedMetadata={handleMeta}
        onDurationChange={handleDuration}
        onTimeUpdate={() => setTime(ref.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
          if (ref.current) ref.current.currentTime = 0;
        }}
      />

      <button
        type="button"
        className="lp-player-btn"
        onClick={toggle}
        aria-label={`${playing ? 'Pause' : 'Play'} the ${call.scenario} recording`}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <span className="lp-player-time">{fmtClock(time)}</span>

      <input
        type="range"
        className="lp-player-range"
        min={0}
        max={total}
        step={0.1}
        value={Math.min(time, total)}
        onChange={seek}
        aria-label="Seek within the recording"
        aria-valuetext={`${fmtClock(time)} of ${fmtClock(total)}`}
        style={{ '--lp-played': `${pct}%` } as CSSProperties}
      />

      <span className="lp-player-time is-rem">-{fmtClock(Math.max(0, total - time))}</span>

      <a className="lp-player-dl" href={call.audio} download aria-label="Download this recording">
        <Download size={15} aria-hidden />
      </a>
    </div>
  );
}

/**
 * "Recent calls" — the QA section's centrepiece.
 *
 * A rail of sample calls on the left, and on the right the one you picked:
 * its recording, the scorecard our QA pass produces, and the issues it
 * flagged. The metrics are illustrative — nothing in the product scores a
 * call yet — and the card says so, the way the static version it replaces did.
 */
function CallShowcase() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const call = DEMO_CALLS[active];

  /*
   * Only the selected call sits in the tab order (the roving tabindex below),
   * which is the tablist pattern — but it means the rail owes the visitor
   * arrow keys, or the other calls cannot be reached by keyboard at all.
   */
  function onRailKeys(e: KeyboardEvent<HTMLDivElement>) {
    const last = DEMO_CALLS.length - 1;
    let next: number;
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': next = active === last ? 0 : active + 1; break;
      case 'ArrowUp': case 'ArrowLeft': next = active === 0 ? last : active - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    e.preventDefault();
    setActive(next);
    setCopied(false);
    railRef.current?.querySelectorAll<HTMLButtonElement>('.lp-call-row')[next]?.focus();
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(call.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* No clipboard over plain http, or inside some embedded webviews. The
         id is on screen regardless, so there is nothing to recover from. */
    }
  }

  return (
    <div className="lp-calls">
      <div className="lp-calls-rail">
        <div className="lp-calls-rail-head">
          <span>{QA.railTitle}</span>
          <span className="lp-calls-count">{DEMO_CALLS.length}</span>
        </div>
        <div
          ref={railRef}
          className="lp-calls-list"
          role="tablist"
          aria-label={QA.railTitle}
          aria-orientation="vertical"
          onKeyDown={onRailKeys}
        >
          {DEMO_CALLS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              id={`lp-call-tab-${c.id}`}
              aria-controls={`lp-call-panel-${c.id}`}
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              className={`lp-call-row${i === active ? ' is-on' : ''}`}
              onClick={() => { setActive(i); setCopied(false); }}
            >
              <span className="lp-call-dot" aria-hidden />
              <span className="lp-call-row-main">
                <span className="lp-call-row-title">{c.vertical}</span>
                <span className="lp-call-row-sub">{c.scenario}</span>
              </span>
              <span className="lp-call-row-len">{fmtLength(c.durationSec)}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="lp-calls-pane"
        role="tabpanel"
        id={`lp-call-panel-${call.id}`}
        aria-labelledby={`lp-call-tab-${call.id}`}
      >
        <div className="lp-call-head">
          <span className="lp-call-avatar" aria-hidden>{call.caller.slice(0, 1)}</span>
          <div className="lp-call-head-main">
            <h3 className="lp-call-who">
              {call.caller}
              <ArrowRight size={18} aria-hidden />
              {call.vertical}
            </h3>
            <button type="button" className="lp-call-copy" onClick={copyId}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? QA.copiedId : QA.copyId}
            </button>
          </div>
          <span className="lp-scorecard-note">{QA.note}</span>
        </div>

        <div className="lp-call-meta">
          <div>
            <div className="lp-call-meta-k">{QA.meta.completed}</div>
            <div className="lp-call-meta-v">{call.completedAt}</div>
          </div>
          <div>
            <div className="lp-call-meta-k">{QA.meta.duration}</div>
            <div className="lp-call-meta-v">{fmtLength(call.durationSec)}</div>
          </div>
          <div>
            <div className="lp-call-meta-k">{QA.meta.status}</div>
            <div className="lp-call-meta-v is-ok">{call.status}</div>
          </div>
        </div>

        <CallPlayer key={call.id} call={call} />

        <div className="lp-scorecard-metrics">
          {call.metrics.map((m) => (
            <div key={m.label}>
              <div className="lp-scorecard-v">{m.value}</div>
              <div className="lp-scorecard-k">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="lp-call-issues">
          <div className="lp-call-issues-head">
            <span className="lp-kicker-sm">{QA.issuesTitle}</span>
            <span className="lp-kicker-sm">{call.issues.length} flagged</span>
          </div>
          {call.issues.map((iss) => (
            <div key={iss.tag} className={`lp-qa-issue is-${iss.severity}`}>
              <div className="lp-qa-issue-head">
                <span className="lp-qa-tag">{iss.tag}</span>
                <strong>{iss.title}</strong>
              </div>
              <p className="lp-qa-issue-text">{iss.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [bucket, setBucket] = useState<Bucket>('activate');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const cases = USE_CASES.filter((u) => u.bucket === bucket);

  /* FAQPage structured data — mirrors the schema.org note in lib/brand.ts. */
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="lp-hero-channels">
          {CHANNELS.map((c) => {
            const Icon = CHANNEL_ICON[c.icon];
            return (
              <span key={c.label} className="lp-hero-channel" title={c.detail}>
                <Icon size={15} aria-hidden />
                {c.label}
              </span>
            );
          })}
        </div>

        <h1 className="lp-h1">{HERO.title}</h1>
        <p className="lp-lede">{HERO.lede}</p>

        <div className="lp-hero-cta">
          <Link to={HERO.primary.to} className="lp-btn lp-btn-primary lp-btn-lg">
            {HERO.primary.label}
          </Link>
          <Link to={HERO.secondary.to} className="lp-btn lp-btn-ghost lp-btn-lg">
            {HERO.secondary.label}
          </Link>
        </div>

        <div className="lp-tryagent-wrap">
          <div className="lp-kicker-sm">{TRY_AGENT.eyebrow}</div>
          <TryAgentForm />
        </div>

        {/* Call console mock — static, illustrative, full width below the copy */}
        <div className="lp-console" aria-hidden>
          <div className="lp-console-bar">
            <span className="lp-console-dots"><span /><span /><span /></span>
            <span className="lp-console-title">{CONSOLE.title}</span>
            <span className="lp-console-status">
              <span className="lp-blink-dot" /> {CONSOLE.status}
            </span>
          </div>
          <div className="lp-console-body">
            <div className="lp-console-stream">
              {CONSOLE.turns.map((t, i) => (
                <div key={i} className={`lp-console-turn${t.who === 'Agent' ? ' is-agent' : ''}`}>
                  <div className="lp-console-who">{t.who}</div>
                  <div className="lp-console-text">{t.text}</div>
                </div>
              ))}
            </div>
            <div className="lp-console-side">
              <div className="lp-console-tool">
                <span className="lp-tool-dot" /> {CONSOLE.tool}
              </div>
              <div className="lp-console-outcome">
                <Check size={14} aria-hidden /> {CONSOLE.outcome}
              </div>
              <div className="lp-console-stats">
                {HERO_STATS.map((s) => (
                  <div key={s.label}>
                    <div className="lp-console-stat-v">{s.value}</div>
                    <div className="lp-console-stat-k">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SOCIAL PROOF ══════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-sechead">
          <div className="lp-eyebrow">{PROOF.heading}</div>
        </div>
        <div className="lp-proof-industries">
          {PROOF.industries.map((i) => <span key={i}>{i}</span>)}
        </div>
        <div className="lp-proof-grid">
          {PROOF.outcomes.map((o) => (
            <figure key={o.label} className="lp-proof-card">
              <blockquote>{o.quote}</blockquote>
              <figcaption>{o.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ══ OMNICHANNEL (left-aligned) ════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-split">
          <div>
            <div className="lp-eyebrow">{OMNI.kicker}</div>
            <h2 className="lp-h2 lp-h2--left">{OMNI.title}</h2>
            <p className="lp-p">{OMNI.body}</p>
          </div>
          <div className="lp-omni-list">
            {CHANNELS.map((c) => {
              const Icon = CHANNEL_ICON[c.icon];
              return (
                <div key={c.label} className="lp-omni-row">
                  <span className="lp-omni-icon"><Icon size={18} aria-hidden /></span>
                  <span>
                    <strong>{c.label}</strong>
                    <span className="lp-muted"> — {c.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ TRUST (left-aligned) ══════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-split">
          <div>
            <div className="lp-eyebrow is-violet">{TRUST.kicker}</div>
            <h2 className="lp-h2 lp-h2--left">{TRUST.title}</h2>
            <p className="lp-p">{TRUST.body}</p>
            <div className="lp-chips" style={{ marginTop: 22 }}>
              {BADGES.map((b) => <span key={b} className="lp-badge">{b}</span>)}
            </div>
          </div>
          <ul className="lp-privacy-points">
            {TRUST.points.map((p) => (
              <li key={p}>
                <span className="lp-tick" aria-hidden><ShieldCheck size={15} /></span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ══ GET STARTED + ASK AI ══════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-cta-band">
          <h2 className="lp-h2">{CTA_BAND.title}</h2>
          <div className="lp-hero-cta" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link to={CTA_BAND.primary.to} className="lp-btn lp-btn-primary lp-btn-lg">
              {CTA_BAND.primary.label}
            </Link>
            <Link to={CTA_BAND.secondary.to} className="lp-btn lp-btn-secondary lp-btn-lg">
              {CTA_BAND.secondary.label}
            </Link>
          </div>
          <div className="lp-ask">
            <span className="lp-ask-lead">{ASK_AI.heading}</span>
            <span className="lp-ask-links">
              {ASK_AI.links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer noopener">
                  {l.label} <ArrowRight size={13} aria-hidden />
                </a>
              ))}
            </span>
          </div>
        </div>
      </section>

      {/* ══ USE CASES ═════════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <SecHead
          eyebrow="USE CASES"
          title="Perfect for every conversation you have."
          intro="The same agent, pointed at a different job. Pick where it earns its keep first."
        />

        <div className="lp-uc-tabs" role="tablist" aria-label="Use case categories">
          {USE_CASE_BUCKETS.map((b) => (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={b.key === bucket}
              onClick={() => setBucket(b.key)}
              className={`lp-uc-tab${b.key === bucket ? ' is-on' : ''}`}
            >
              <strong>{b.label}</strong>
              <span>{b.blurb}</span>
            </button>
          ))}
        </div>

        <div className="lp-uc">
          {cases.map((u) => (
            <Link key={u.title} to={u.to} className="lp-uc-card">
              <div className="lp-kicker-sm">{u.tag}</div>
              <h3 className="lp-uc-title">{u.title}</h3>
              <p className="lp-uc-body">{u.body}</p>
              <span className="lp-uc-more">Explore <ArrowRight size={13} aria-hidden /></span>
            </Link>
          ))}
        </div>

        <div className="lp-sechead" style={{ marginTop: 44, marginBottom: 0 }}>
          <div className="lp-eyebrow is-violet">INDUSTRIES</div>
        </div>
        <div className="lp-chips lp-chips--centre">
          {INDUSTRIES.map((i) => (
            <Link key={i.label} to={i.to} className="lp-chip">{i.label}</Link>
          ))}
        </div>
      </section>

      {/* ══ QA & ANALYTICS ════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <SecHead eyebrow={QA.kicker} title={QA.title} intro={QA.body} />

        <CallShowcase />

        <div className="lp-sechead-link">
          <Link to={QA.link.to} className="lp-uc-more">
            {QA.link.label} <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ══ CAPABILITIES ══════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <SecHead eyebrow="BUILT FOR REAL CALLS" title="Fast, multilingual, and ready for volume." />
        <div className="lp-caps">
          {CAPABILITIES.map((c, i) => {
            const Icon = CAPABILITY_ICONS[i] ?? Zap;
            return (
              <div key={c.title} className="lp-cap-card">
                <span className="lp-cap-icon" style={{ color: ACCENT[c.accent] }}>
                  <Icon size={20} aria-hidden />
                </span>
                <div className="lp-cap-stat" style={{ color: ACCENT[c.accent] }}>{c.stat}</div>
                <h3 className="lp-cap-title">{c.title}</h3>
                <p className="lp-cap-body">{c.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ INTEGRATIONS ══════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <SecHead
          eyebrow="INTEGRATIONS"
          title="One layer to orchestrate every tool."
          intro="The agent reads and writes the systems you already run — during the call, not after it."
        />
        <div className="lp-int">
          {INTEGRATIONS.map((it) => (
            <div key={it.name} className="lp-int-card">
              <span className="lp-int-mark"><Plug size={15} aria-hidden /></span>
              <div>
                <div className="lp-int-name">{it.name}</div>
                <div className="lp-int-detail">{it.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="lp-sechead-link">
          <Link to={INTEGRATIONS_LINK.to} className="lp-uc-more">
            {INTEGRATIONS_LINK.label} <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ══ BUILDER CANVAS ════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <SecHead eyebrow={BUILDER.kicker} title={BUILDER.title} intro={BUILDER.body} violet />
        <div className="lp-flow" aria-hidden>
          {FLOW.map((n, i) => (
            <div key={i} className={`lp-flow-node is-${n.kind}`}>
              <span className="lp-flow-dot" style={{ background: n.accent ? ACCENT[n.accent] : 'var(--tx-3)' }} />
              <span className="lp-flow-label">{n.label}</span>
              {n.meta && <span className="lp-flow-meta">{n.meta}</span>}
            </div>
          ))}
        </div>
        <div className="lp-sechead-link">
          <Link to={BUILDER.link.to} className="lp-btn lp-btn-secondary">
            {BUILDER.link.label} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ══ FAQ ═══════════════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <SecHead eyebrow="FAQ" title="Voice AI, explained." />
        <div className="lp-faq">
          {FAQ.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={f.q} className={`lp-faq-item${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : i)}
                >
                  <span>{f.q}</span>
                  <span className="lp-faq-sign" aria-hidden>{open ? '–' : '+'}</span>
                </button>
                {open && <p className="lp-faq-a">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════ */}
      <section className="lp-final">
        <h2 className="lp-final-h">{FINAL.title}</h2>
        <div className="lp-hero-cta" style={{ justifyContent: 'center', marginTop: 28 }}>
          <Link to={FINAL.primary.to} className="lp-btn lp-btn-primary lp-btn-lg">{FINAL.primary.label}</Link>
          <Link to={FINAL.secondary.to} className="lp-btn lp-btn-ghost lp-btn-lg">{FINAL.secondary.label}</Link>
        </div>
        <p className="lp-final-fine">
          Questions about volume pricing or a custom deployment?{' '}
          <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
        </p>
      </section>

      <SupportWidget />
    </div>
  );
}
