import { Link } from 'react-router-dom';

/*
 * Public pricing — the model, not the number.
 *
 * History, so nobody "restores" this by mistake:
 *   1. It rendered a monthly plan catalogue (Starter / Jump Starter / Early
 *      Deployers / Growth / Enterprise) with a comparison table.
 *   2. The catalogue was deleted when billing moved to a prepaid wallet, and
 *      this page rendered the live per-minute rate from GET /config/wallet-rate.
 *   3. The rate came off too. A visitor meeting a figure before they have any
 *      sense of what a call is worth to them prices it against nothing, and
 *      leaves. So this page explains how billing works and hands the number to
 *      a person: /contact.
 *
 * NO RATE, NO ESTIMATOR, NO TOP-UP FIGURE ON THIS PAGE. The real number lives
 * in Super Admin → Wallet Rate and is shown to a signed-in account in Billing,
 * which is the same value settlement deducts — so what a customer is quoted and
 * what the wallet takes still cannot drift apart.
 *
 * The Spandan Pricing.dc.html design is a three-tier card grid. That grid is
 * deliberately NOT ported — it is the plan catalogue this product removed. What
 * is ported is its type scale, eyebrow and panel treatment.
 */

const COVERED = [
  'Speech recognition, the language model, the voice and the phone line — all inside the one per-minute figure.',
  'Unlimited agents and unlimited simultaneous calls. Your balance is the only limit.',
  'Top up by card or UPI, any amount, whenever you want.',
  'Every debit itemised in your wallet ledger, one line per call.',
];

const HOW = [
  {
    k: 'You are billed for talk-minutes',
    v: 'The meter starts when the call connects and stops when it ends. Ringing, failed calls and idle agents cost nothing.',
  },
  {
    k: 'There is no plan to pick',
    v: 'No tiers, no seats, no monthly minimum and nothing to cancel. You load a balance and spend it as your agents talk.',
  },
  {
    k: 'One figure covers the whole call',
    v: 'Recognition, model, voice and telephony are not billed separately — there is a single per-minute figure and that is the whole of it.',
  },
  {
    k: 'You see your rate before you spend',
    v: 'Sign up free and it is in Billing straight away, before you load a rupee. Or tell us your volume and we will walk you through it first.',
  },
];

export default function Pricing() {
  return (
    <div className="rz-page">
      {/* Hero */}
      <div style={{ padding: '80px 24px 56px', textAlign: 'center', borderBottom: '1px solid var(--line)' }}>
        <div className="rz-wrap" style={{ maxWidth: 780 }}>
          <div className="rz-eyebrow-pill">Pricing</div>
          <h1 className="rz-h1" style={{ fontSize: 'clamp(34px, 5vw, 52px)', margin: '18px 0 0' }}>
            Pay for the minutes your agents actually talk.
          </h1>
          <p className="rz-sub-lg" style={{ margin: '14px auto 0', maxWidth: 620 }}>
            No plans, no seats, no monthly minimum — and the figure comes from a conversation,
            not a price tag.
          </p>
          <div className="rz-cluster rz-mono" style={{ justifyContent: 'center', gap: 20, marginTop: 20 }}>
            <span>no setup fees</span>
            <span>nothing renews</span>
            <span>balance never expires</span>
          </div>
        </div>
      </div>

      <div className="rz-wrap" style={{ maxWidth: 780, padding: '48px 24px 90px' }}>
        {/* The offer, without a number */}
        <div
          className="rz-card"
          style={{
            borderRadius: 18,
            padding: 'clamp(28px, 5vw, 44px)',
            textAlign: 'center',
            marginBottom: 20,
            background:
              'radial-gradient(circle at top right, rgba(14,179,158,0.12), transparent 45%), var(--s1)',
            borderColor: 'var(--line-2)',
          }}
        >
          <div className="rz-label">What it costs</div>
          <div
            className="rz-h1"
            style={{ fontSize: 'clamp(26px, 5vw, 38px)', color: 'var(--cyan-fg)', margin: '12px 0 0' }}
          >
            Talk-minutes only
          </div>
          <p className="rz-sub-lg" style={{ margin: '14px auto 0', maxWidth: 520 }}>
            What that works out to depends on how long your calls run and how many you take.
            Tell us roughly what you expect and we will price it with you — or start free and
            see your rate in Billing before you load anything.
          </p>

          <div className="rz-cluster" style={{ justifyContent: 'center', marginTop: 26 }}>
            <Link to="/contact" className="rz-btn rz-btn-primary rz-btn-lg">Talk to us about pricing</Link>
            <Link to="/signup" className="rz-btn rz-btn-secondary rz-btn-lg">Start free</Link>
          </div>
        </div>

        <div className="rz-card rz-card-lg" style={{ marginBottom: 20 }}>
          <div className="rz-h3" style={{ marginBottom: 18 }}>How billing works</div>
          <div className="rz-stack" style={{ gap: 18 }}>
            {HOW.map((row) => (
              <div key={row.k}>
                <div style={{ fontFamily: 'var(--ff-d)', fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>
                  {row.k}
                </div>
                <p className="rz-sub" style={{ margin: 0, fontSize: 14.5 }}>{row.v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rz-card rz-card-lg">
          <div className="rz-h3" style={{ marginBottom: 18 }}>What a talk-minute covers</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {COVERED.map((line) => (
              <li
                key={line}
                style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, fontSize: 14.5, lineHeight: 1.6, color: 'var(--tx-2)' }}
              >
                <span style={{ color: 'var(--cyan-fg)' }} aria-hidden>✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="rz-mono" style={{ marginTop: 20, lineHeight: 1.7 }}>
            Rented phone numbers are billed separately at the carrier’s monthly rate. Calls stop
            when the balance runs out and resume the moment you top up.{' '}
            <Link to="/contact" style={{ color: 'var(--cyan-fg)' }}>Ask us anything about it</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
