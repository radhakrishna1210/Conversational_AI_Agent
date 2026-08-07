import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/*
 * Public pricing — one rate, no plans.
 *
 * This page used to render the monthly plan catalogue (Starter / Jump Starter /
 * Early Deployers / Growth / Enterprise) with a feature comparison table. That
 * catalogue no longer exists: the product bills talk-minutes against a prepaid
 * wallet at a single platform rate, so there is nothing to compare.
 *
 * The figure comes from GET /config/wallet-rate — the same admin-managed value
 * settlement actually deducts and the landing page quotes. It is never
 * hardcoded, and if the endpoint is unreachable the page says so rather than
 * inventing a price.
 */

const inr = (amount: number, digits = 2) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(amount);

export default function Pricing() {
  /** undefined while in flight, null if the endpoint could not be reached. */
  const [rate, setRate] = useState<number | null | undefined>(undefined);

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

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <h1 style={{ color: 'var(--teal-fg)' }}>Pricing</h1>
          <p>Top up a wallet and pay for the minutes your agents actually talk. No plans, no seats, no monthly minimum.</p>
          <div className="pricing-perks" style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
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
            Deducted per talk-minute
          </div>

          {rate === undefined && (
            <div style={{ fontSize: 42, fontWeight: 700, color: 'var(--text-muted)' }}>Loading…</div>
          )}

          {rate === null && (
            <>
              <div style={{ fontSize: 42, fontWeight: 700, color: 'var(--text-muted)' }}>—</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 12 }}>
                The rate could not be loaded just now. Refresh in a moment, or{' '}
                <Link to="/contact" style={{ color: 'var(--teal-fg)' }}>ask us directly</Link>.
              </p>
            </>
          )}

          {typeof rate === 'number' && (
            <>
              <div style={{ fontSize: 'clamp(44px, 9vw, 68px)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--teal-fg)', lineHeight: 1 }}>
                {inr(rate)}
                <span style={{ fontSize: '0.3em', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 10 }}>/ min</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 14 }}>
                A {inr(1000, 0)} top-up buys about {Math.floor(1000 / rate).toLocaleString('en-IN')} minutes.
              </p>
            </>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
            <Link to="/signup"><button className="btn btn-primary">Start free</button></Link>
            <Link to="/contact"><button className="btn btn-secondary">Talk to us</button></Link>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(20px, 4vw, 30px)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>What the rate covers</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'Speech recognition, the language model, the voice and the phone line — all inside the per-minute rate.',
              'Unlimited agents and unlimited simultaneous calls. Your balance is the only limit.',
              'Top up by card or UPI, any amount, whenever you want.',
              'Every debit itemised in your wallet ledger, one line per call.',
            ].map((line) => (
              <li key={line} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--teal-fg)' }}>✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 20, lineHeight: 1.6 }}>
            Rented phone numbers are billed separately at the carrier’s monthly rate. Calls stop
            when the balance runs out and resume the moment you top up.
          </p>
        </div>
      </div>
    </>
  );
}
