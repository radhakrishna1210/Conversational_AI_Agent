import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import VoiceCore from '@/components/home/VoiceCore';
import { voiceColor, type VoiceStateId } from '@/lib/voiceStates';
import { useConversationReplay } from './home/useConversationReplay';
import {
  BADGES, BIG_STATS, COMPARE, CONNECTORS, FEATURES, HERO_STATS, INDUSTRIES,
  NARRATIVE, SCENARIOS, STACK, USE_CASES, VERTICALS, type Support,
} from './home/content';
import './Home.css';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LANDING PAGE — ported from Spandan_flagship_selection/Spandan Homepage.dc.html
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The organising idea is the call itself: a voice core that visibly changes
 * state, a conversation you can watch replay turn by turn, and then the same
 * six states walked through once as narrative and once as architecture.
 *
 * Everything is scoped under `.lp` so it cannot reach the app shell.
 *
 * ── One deliberate omission ──
 * The design carries a three-tier pricing grid (Starter $0 / Growth $99 /
 * Enterprise). It is NOT ported. This product bills a prepaid wallet at one
 * per-minute rate — there is no tier to choose — and no price is shown
 * anywhere public by decision (see the header of Pricing.tsx). Porting the
 * grid would put three prices on the busiest page of the site for plans that
 * do not exist. The section's slot is filled by the final CTA instead.
 */

const STATE_ORDER: VoiceStateId[] = ['idle', 'listening', 'understanding', 'thinking', 'speaking', 'acting'];

export default function Home() {
  /* ── Hero: idles through the six states until the demo takes over ─────── */
  const [heroState, setHeroState] = useState<VoiceStateId>('listening');
  const [heroLat, setHeroLat] = useState('318ms');

  /* ── Demo ─────────────────────────────────────────────────────────────── */
  const [scenarioKey, setScenarioKey] = useState('reception');
  const { replay, scenario, replayAgain } = useConversationReplay(scenarioKey);

  /* ── Narrative ────────────────────────────────────────────────────────── */
  const [narrIdx, setNarrIdx] = useState(0);
  const narrRef = useRef<HTMLDivElement | null>(null);

  /* ── Stack stepper + industry tabs ────────────────────────────────────── */
  const [stackIdx, setStackIdx] = useState(0);
  const [vertical, setVertical] = useState('healthcare');

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // The hero cycles only while the demo is idle, so the two figures never
  // contradict each other — during playback the hero mirrors the live turn.
  const playingRef = useRef(replay.playing);
  playingRef.current = replay.playing;

  useEffect(() => {
    const id = setInterval(() => {
      if (playingRef.current) return;
      setHeroState((s) => STATE_ORDER[(STATE_ORDER.indexOf(s) + 1) % STATE_ORDER.length]);
      setHeroLat(`${280 + Math.floor(Math.random() * 60)}ms`);
    }, 1700);
    return () => clearInterval(id);
  }, []);

  // Keep the newest turn in view. rAF so the scroll happens after the row has
  // actually been laid out, and `isConnected` because a scenario switch can
  // unmount the node between the commit and the frame.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      if (el.isConnected) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [replay.turns.length, replay.typing]);

  // Retint the sticky core as each narrative step passes the middle of the
  // viewport. The -45%/-45% margins collapse the root to a thin band, so
  // exactly one step is "current" at a time.
  useEffect(() => {
    const root = narrRef.current;
    if (!root) return;
    const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-narr]'));
    if (!steps.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setNarrIdx(Number(e.target.getAttribute('data-narr')) || 0);
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    steps.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const scrollTo = useCallback((id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.pageYOffset - 70,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, []);

  const heroLive = replay.playing ? replay.state : heroState;
  const narr = NARRATIVE[narrIdx] ?? NARRATIVE[0];
  const layer = STACK[stackIdx] ?? STACK[0];
  const v = VERTICALS[vertical];

  return (
    <div className="lp">
      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section id="top" className="lp-hero">
        <div>
          <div className="lp-live-badge">
            <span className="lp-blink-dot" />
            LIVE · avg first-response ~320 ms
          </div>

          <h1 className="lp-h1">
            Calls that forget<br />they’re talking<br />
            to <span className="lp-h1-accent">AI</span>.
          </h1>

          <p className="lp-lede">
            Spandan builds conversational voice agents that answer and place real phone calls —
            interrupting naturally, pulling from your knowledge base, and firing actions in your
            CRM, calendar and tools while the conversation is still happening.
          </p>

          <div className="lp-hero-cta">
            <a href="#demo" onClick={scrollTo('demo')} className="lp-btn lp-btn-primary lp-btn-lg">
              <span className="lp-blink-dot lp-blink-dot--dark" /> Hear it live
            </a>
            <a href="#stack" onClick={scrollTo('stack')} className="lp-btn lp-btn-ghost lp-btn-lg">
              Explore the stack →
            </a>
          </div>

          <div className="lp-hero-stats">
            {HERO_STATS.map((s, i) => (
              <Fragment key={s.label}>
                {/* Rule between, not after — a trailing divider on the last
                    stat reads as a missing fourth column. */}
                {i > 0 && <div className="lp-hero-rule" />}
                <div>
                  <div className="lp-hero-stat-v">{s.value}</div>
                  <div className="lp-hero-stat-k">{s.label}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        {/* Voice core */}
        <div className="lp-core">
          <VoiceCore state={heroLive} pointer className="lp-core-canvas" />
          <div className="lp-core-label">
            <div className="lp-core-kicker">VOICE CORE</div>
            <div className="lp-core-state" style={{ color: voiceColor(heroLive) }}>
              {heroLive.toUpperCase()}
            </div>
          </div>
          <div className="lp-core-foot">
            <span>turn <span style={{ color: 'var(--cyan-fg)' }}>
              {heroLive === 'listening' || heroLive === 'idle' ? 'caller' : 'agent'}
            </span></span>
            <span>lat <span style={{ color: 'var(--lime)' }}>{heroLat}</span></span>
          </div>
          <div className="lp-core-corner">◍ barge-in on</div>
        </div>
      </section>

      {/* ══ CONNECTS TO ═══════════════════════════════════════════════════ */}
      <section className="lp-marquee-band">
        <div className="lp-marquee-inner">
          <span className="lp-marquee-kicker">CONNECTS TO</span>
          <div className="lp-marquee-mask">
            {/* Listed twice so the -50% translate loops seamlessly. */}
            <div className="lp-marquee-track" aria-hidden>
              {[...CONNECTORS, ...CONNECTORS].map((c, i) => <span key={i}>{c}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ══ HEAR IT LIVE ══════════════════════════════════════════════════ */}
      <section id="demo" className="lp-sec">
        <div className="lp-sec-head">
          <div>
            <div className="lp-kicker">// HEAR IT LIVE</div>
            <h2 className="lp-h2">Pick a scenario. Watch it think.</h2>
            <p className="lp-p">
              A curated conversation replays turn by turn — transcript, live turn-state and the
              exact tools the agent fires. <span className="lp-muted">Illustrative sample.</span>
            </p>
          </div>
          <div className="lp-scenarios">
            {Object.entries(SCENARIOS).map(([key, s]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScenarioKey(key)}
                className={`lp-pill${key === scenarioKey ? ' is-on' : ''}`}
                aria-pressed={key === scenarioKey}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lp-demo-grid">
          {/* Transcript */}
          <div className="lp-terminal">
            <div className="lp-terminal-bar">
              <span className="lp-dots">
                <span style={{ background: '#ff5f57' }} />
                <span style={{ background: '#febc2e' }} />
                <span style={{ background: '#28c840' }} />
              </span>
              <span style={{ color: 'var(--tx-2)' }}>{scenario.title}</span>
              <span className="lp-connected">
                <span className="lp-blink-dot" /> connected
              </span>
            </div>

            <div className="lp-transcript" ref={transcriptRef} aria-live="polite">
              {replay.turns.map((t) => {
                const agent = t.who === 'agent';
                return (
                  <div key={t.key} className={`lp-turn${agent ? '' : ' is-caller'}`}>
                    <div
                      className={`lp-bubble${agent ? ' is-agent' : ''}`}
                      style={agent ? { borderColor: `${voiceColor(t.s)}55` } : undefined}
                    >
                      <div className="lp-bubble-tag">{t.tag}</div>
                      <div className="lp-bubble-text">{t.text}</div>
                      {t.tool && (
                        <div className="lp-tool">
                          <span className="lp-tool-dot" />
                          {t.tool}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {replay.typing && <div className="lp-typing">agent is thinking…</div>}
            </div>
          </div>

          {/* Telemetry */}
          <div className="lp-telemetry">
            <div className="lp-card lp-turnstate">
              <div className="lp-kicker-sm">TURN STATE</div>
              <div className="lp-turnstate-v" style={{ color: voiceColor(replay.state) }}>
                {replay.state.toUpperCase()}
              </div>
              <div className="lp-progress">
                {STATE_ORDER.map((s, i) => (
                  <span
                    key={s}
                    style={{
                      background: i <= replay.stateIndex ? voiceColor(replay.state) : 'var(--s3)',
                    }}
                  />
                ))}
              </div>
              <VoiceCore state={replay.state} small className="lp-turnstate-canvas" />
            </div>

            <div className="lp-card lp-metrics">
              <div>
                <div className="lp-kicker-sm">FIRST TOKEN</div>
                <div className="lp-metric">{replay.latency}<span> ms</span></div>
              </div>
              <div>
                <div className="lp-kicker-sm">TURNS</div>
                <div className="lp-metric">{replay.turnCount}</div>
              </div>
              <div>
                <div className="lp-kicker-sm">INTERRUPTS</div>
                <div className="lp-metric" style={{ color: 'var(--coral)' }}>{replay.interrupts}</div>
              </div>
              <div>
                <div className="lp-kicker-sm">TOOLS FIRED</div>
                <div className="lp-metric" style={{ color: 'var(--lime)' }}>{replay.toolsFired}</div>
              </div>
            </div>

            <button type="button" onClick={replayAgain} className="lp-btn lp-btn-secondary lp-btn-block">
              ↻ Replay conversation
            </button>
          </div>
        </div>
      </section>

      {/* ══ ANATOMY OF ONE CALL ═══════════════════════════════════════════ */}
      <section id="how" className="lp-sec">
        <div className="lp-sec-centre">
          <div className="lp-kicker lp-kicker--violet">// ANATOMY OF ONE CALL</div>
          <h2 className="lp-h2">One conversation, start to outcome</h2>
        </div>

        <div className="lp-narr">
          <div className="lp-narr-core">
            <div className="lp-narr-frame">
              <VoiceCore state={narr.state} className="lp-core-canvas" />
              <div className="lp-narr-step">{narr.num} / {narr.kicker}</div>
              <div className="lp-narr-foot">
                <span>state <span style={{ color: voiceColor(narr.state) }}>{narr.state}</span></span>
                <span style={{ marginLeft: 'auto' }}>◍ real-time</span>
              </div>
            </div>
          </div>

          <div ref={narrRef}>
            {NARRATIVE.map((n, i) => (
              <div key={n.num} data-narr={i} className="lp-narr-step-block">
                <div className="lp-narr-num">{n.num}</div>
                <div className="lp-kicker">{n.kicker}</div>
                <h3 className="lp-h3">{n.title}</h3>
                <p className="lp-p">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ VOICE LAB ═════════════════════════════════════════════════════ */}
      <section id="lab" className="lp-sec">
        <div className="lp-lab">
          <div>
            <div className="lp-badge-lime">NEW · P2</div>
            <h2 className="lp-h2">The Voice Lab</h2>
            <p className="lp-p">
              Dial in personality, language, pace and warmth, type a line, and watch a generative{' '}
              <strong style={{ color: 'var(--tx)' }}>voice fingerprint</strong> respond to pitch,
              energy and conversation state. Every voice looks like it sounds.
            </p>
            <div className="lp-hero-cta" style={{ marginTop: 22 }}>
              <Link to="/clone_voice" className="lp-btn lp-btn-violet">Open Voice Lab</Link>
              <Link to="/voice_assistant" className="lp-btn lp-btn-ghost">Try “Can you tell?” →</Link>
            </div>
          </div>
          <div className="lp-lab-canvas-wrap">
            <VoiceCore state="speaking" className="lp-core-canvas" />
          </div>
        </div>
      </section>

      {/* ══ SOLUTIONS ═════════════════════════════════════════════════════ */}
      <section id="usecases" className="lp-sec">
        <div className="lp-kicker">// SOLUTIONS</div>
        <h2 className="lp-h2" style={{ marginBottom: 24 }}>Built for the calls you make every day</h2>

        <div className="lp-uc">
          {USE_CASES.map((u) => (
            <Link key={u.title} to={u.to} className="lp-uc-card">
              <div className="lp-kicker-sm">{u.tag}</div>
              <h3 className="lp-uc-title">{u.title}</h3>
              <p className="lp-uc-body">{u.body}</p>
              <div className="lp-uc-more">Explore →</div>
            </Link>
          ))}
        </div>

        <div className="lp-kicker lp-kicker--violet" style={{ marginTop: 48 }}>// INDUSTRIES</div>
        <div className="lp-chips">
          {INDUSTRIES.map((i) => (
            <Link key={i.label} to={i.to} className="lp-chip">{i.label}</Link>
          ))}
        </div>
      </section>

      {/* ══ THE PLATFORM ══════════════════════════════════════════════════ */}
      <section id="product" className="lp-sec">
        <div className="lp-kicker">// THE PLATFORM</div>
        <h2 className="lp-h2" style={{ marginBottom: 24 }}>Everything a real call needs</h2>
        <div className="lp-feat">
          {FEATURES.map((f) => (
            <Link key={f.title} to={f.to} className="lp-feat-card">
              <div className="lp-feat-mark">{f.mark}</div>
              <h3 className="lp-feat-title">{f.title}</h3>
              <p className="lp-feat-body">{f.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ THE FULL STACK ════════════════════════════════════════════════ */}
      <section id="stack" className="lp-sec">
        <div className="lp-kicker">// THE FULL STACK</div>
        <h2 className="lp-h2" style={{ marginBottom: 8 }}>Every layer of the call, one platform.</h2>
        <p className="lp-p" style={{ maxWidth: 620, marginBottom: 28 }}>
          From the carrier line to the outcome in your CRM, Spandan owns each layer a real
          conversation passes through — so there are no handoffs, and nothing between your agent
          and the person on the other end.
        </p>

        <div className="lp-stack-grid">
          <div className="lp-stack-list">
            {STACK.map((l, i) => {
              const on = i === stackIdx;
              return (
                <button
                  key={l.num}
                  type="button"
                  onClick={() => setStackIdx(i)}
                  aria-pressed={on}
                  className={`lp-stack-row${on ? ' is-on' : ''}`}
                  style={on ? { borderLeftColor: l.color } : undefined}
                >
                  <span
                    className="lp-stack-num"
                    style={on ? { background: l.color, color: 'var(--on-cyan)', border: 'none' } : undefined}
                  >
                    {l.num}
                  </span>
                  <span className="lp-stack-copy">
                    <span className="lp-stack-title">{l.title}</span>
                    {on && <span className="lp-stack-body">{l.body}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="lp-stack-panel">
            <VoiceCore state={layer.state} className="lp-core-canvas" style={{ opacity: 0.9 }} />
            <div className="lp-stack-detail">
              <div className="lp-kicker-sm" style={{ color: layer.color, letterSpacing: '2px' }}>
                {layer.kicker}
              </div>
              <h3 className="lp-stack-detail-title">{layer.title}</h3>
              <p className="lp-p" style={{ maxWidth: 440, fontSize: 15 }}>{layer.detail}</p>
              <div className="lp-stack-controls">
                <button
                  type="button"
                  className="lp-btn lp-btn-primary"
                  onClick={() => setStackIdx((i) => (i + 1) % STACK.length)}
                >
                  Next layer →
                </button>
                <div className="lp-stack-dots">
                  {STACK.map((l, i) => (
                    <span
                      key={l.num}
                      style={{
                        width: i === stackIdx ? 22 : 7,
                        background: i === stackIdx ? layer.color : 'var(--s3)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ WHY SPANDAN ═══════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-kicker lp-kicker--violet">// WHY SPANDAN</div>
        <h2 className="lp-h2" style={{ marginBottom: 8 }}>Not a chatbot with a phone number.</h2>
        <p className="lp-p" style={{ maxWidth: 600, marginBottom: 28 }}>
          Most tools bolt speech onto a text bot. Spandan is built for the call itself —
          interruptions, latency, tools and outcomes, end to end.
        </p>

        <div className="lp-compare">
          <div className="lp-compare-scroll">
            <table>
              <thead>
                <tr>
                  <th className="lp-compare-cap">Capability</th>
                  <th className="lp-compare-us">Spandan</th>
                  <th>Chatbot + TTS</th>
                  <th>Legacy IVR</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.label}>
                    <td className="lp-compare-label">{r.label}</td>
                    <td><Mark v={r.us} /></td>
                    <td><Mark v={r.bot} /></td>
                    <td><Mark v={r.ivr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══ INDUSTRY TABS ═════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-kicker">// TRANSFORM WORKFLOWS</div>
        <h2 className="lp-h2" style={{ marginBottom: 28 }}>One agent, tuned to your industry</h2>

        <div className="lp-vert-grid">
          <div className="lp-stack-list">
            {Object.entries(VERTICALS).map(([key, d]) => {
              const on = key === vertical;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVertical(key)}
                  aria-pressed={on}
                  className={`lp-vert-tab${on ? ' is-on' : ''}`}
                >
                  <span className="lp-vert-name">{d.name}</span>
                  <span className="lp-vert-short">{d.short}</span>
                </button>
              );
            })}
          </div>

          <div className="lp-vert-panel">
            <div className="lp-kicker-sm" style={{ color: v.accent, letterSpacing: '2px' }}>{v.kicker}</div>
            <h3 className="lp-vert-title">{v.title}</h3>
            <p className="lp-p" style={{ maxWidth: 460, fontSize: 16 }}>{v.body}</p>
            <div className="lp-vert-metrics">
              {v.metrics.map((m) => (
                <div key={m.label}>
                  <div className="lp-vert-metric-v" style={{ color: v.accent }}>{m.value}</div>
                  <div className="lp-vert-metric-k">{m.label}</div>
                </div>
              ))}
            </div>
            <Link to={v.to} className="lp-vert-more" style={{ color: v.accent }}>Learn more →</Link>
          </div>
        </div>
      </section>

      {/* ══ STATS + COMPLIANCE ════════════════════════════════════════════ */}
      <section className="lp-stats-band">
        <div className="lp-stats-grid">
          {BIG_STATS.map((s) => (
            <div key={s.kicker}>
              <div className="lp-kicker-sm">{s.kicker}</div>
              <div className="lp-big-stat">{s.value}</div>
              <div className="lp-big-stat-body">{s.body}</div>
            </div>
          ))}
        </div>
        <div className="lp-compliance">
          <span className="lp-kicker-sm">COMPLIANCE, BY DEFAULT</span>
          <div className="lp-chips" style={{ marginTop: 0 }}>
            {BADGES.map((b) => <span key={b} className="lp-badge">{b}</span>)}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════ */}
      <section className="lp-final">
        <h2 className="lp-final-h">Give your product a<br />voice that answers.</h2>
        <div className="lp-hero-cta" style={{ justifyContent: 'center', marginTop: 28 }}>
          <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg">Build an agent free</Link>
          <Link to="/book-appointment" className="lp-btn lp-btn-ghost lp-btn-lg">Book a demo</Link>
        </div>
      </section>
    </div>
  );
}

/** Capability mark in the comparison table. */
function Mark({ v }: { v: Support }) {
  if (v === 'yes') return <span className="lp-mark-yes" aria-label="supported">✓</span>;
  if (v === 'partial') return <span className="lp-mark-part">partial</span>;
  return <span className="lp-mark-no" aria-label="not supported" />;
}
