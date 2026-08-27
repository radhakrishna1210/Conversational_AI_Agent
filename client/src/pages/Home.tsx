import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MessageCircle, MessagesSquare, Globe, ShieldCheck, Check,
  Languages, Zap, Radio, Brain, ArrowRight, Plug, AlertTriangle,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import {
  ACCENT, HERO, CHANNELS, HERO_STATS, CONSOLE, PROOF, OMNI, TRUST, BADGES,
  ASK_AI, CTA_BAND, USE_CASE_BUCKETS, USE_CASES, INDUSTRIES, QA, CAPABILITIES,
  INTEGRATIONS, INTEGRATIONS_LINK, BUILDER, FLOW, FAQ, FINAL,
  type Bucket, type Channel,
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

        <div className="lp-scorecard" aria-hidden>
          <div className="lp-scorecard-head">
            <span>{QA.card.title}</span>
            <span className="lp-scorecard-note">{QA.card.note}</span>
          </div>
          <div className="lp-scorecard-metrics">
            {QA.card.metrics.map((m) => (
              <div key={m.label}>
                <div className="lp-scorecard-v">{m.value}</div>
                <div className="lp-scorecard-k">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="lp-scorecard-issues">
            <div className="lp-kicker-sm">Issues flagged on this call</div>
            {QA.card.issues.map((iss) => (
              <div key={iss.tag} className={`lp-qa-issue is-${iss.severity}`}>
                <AlertTriangle size={14} aria-hidden />
                <span><strong>{iss.tag}</strong> — {iss.text}</span>
              </div>
            ))}
          </div>
        </div>

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
    </div>
  );
}
