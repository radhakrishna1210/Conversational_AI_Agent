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
    <>
      <div className="page-hero">
        <div className="container">
          <h1 style={{ color: 'var(--teal-fg)' }}>Pricing</h1>
          <p>
            Pay for the minutes your agents actually talk. No plans, no seats, no monthly
            minimum — and the figure comes from a conversation, not a price tag.
          </p>
          <div className="pricing-perks" style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span>✓ No setup fees</span>
            <span>✓ Nothing renews</span>
            <span>✓ Balance never expires monthly</span>
          </div>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 780, paddingBottom: 80 }}>
        <div
          style={{
            border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)',
            padding: 'clamp(28px, 5vw, 48px)', textAlign: 'center', marginBottom: 28,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
            What it costs
          </div>
          <div style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, color: 'var(--teal-fg)' }}>
            Talk-minutes only
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, marginTop: 14, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            What that works out to depends on how long your calls run and how many you
            take. Tell us roughly what you expect and we will price it with you — or
            start free and see your rate in Billing before you load anything.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
            <Link to="/contact"><button className="btn btn-primary">Talk to us about pricing</button></Link>
            <Link to="/signup"><button className="btn btn-secondary">Start free</button></Link>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(20px, 4vw, 30px)', marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>How billing works</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {HOW.map((row) => (
              <div key={row.k}>
                <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>{row.k}</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{row.v}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(20px, 4vw, 30px)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>What a talk-minute covers</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {COVERED.map((line) => (
              <li key={line} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--teal-fg)' }}>✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 20, lineHeight: 1.6 }}>
            Rented phone numbers are billed separately at the carrier’s monthly rate. Calls stop
            when the balance runs out and resume the moment you top up.{' '}
            <Link to="/contact" style={{ color: 'var(--teal-fg)' }}>Ask us anything about it</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
