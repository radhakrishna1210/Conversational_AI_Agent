import { useEffect, useState } from 'react';
import { whapi } from '../lib/whapi';
import { loadRazorpay, openCheckout } from '../lib/razorpayCheckout';

/*
 * Billing — a wallet, and nothing else.
 *
 * This page used to be "Balance & Plans": a plan-card grid, a per-plan chatbot
 * price table, a per-plan feature comparison, and an upgrade/downgrade flow.
 * All of it is gone. The product bills one platform rate per talk-minute against
 * a prepaid balance, so there is no tier to choose, no allowance to track and
 * nothing to upgrade to — showing a plan chooser would be showing a control that
 * does not exist.
 *
 * What remains is what a prepaid wallet actually needs: what you have, what a
 * minute costs, how long that lasts, how to add more, and every debit itemised.
 * The rate is served with the wallet (GET /wallet -> perMinuteRateCents) from
 * the same admin-managed value settlement charges.
 */

interface TxnDto {
  id: string; amountCents: number; balanceAfterCents: number;
  type: string; note: string | null; createdAt: string;
}

interface WalletDto {
  balanceCents: number; currency: string; transactions: TxnDto[];
  topUpAvailable: boolean; topUpUnavailableReason?: string | null;
  razorpayKeyId?: string | null; minTopUpCents: number; maxTopUpCents: number;
  /** The one rate this deployment charges, in minor units per minute. */
  perMinuteRateCents: number;
}

interface InvoiceDto {
  id: string; number: string | null; amountCents: number;
  currency: string; status: string; invoiceDate: string; planName: string; type: string;
}

/**
 * Format minor units in the wallet's OWN currency. The wallet is denominated in
 * INR because Razorpay settles INR; this page previously divided by 100 and
 * rendered a bare number next to a '$', which misstated every amount by the FX
 * rate.
 */
const fmt = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(minor / 100);

// Paise. Sized as round top-up amounts now that nothing has to cover a plan
// price — the largest preset used to exist only to fund a Growth upgrade.
const PRESET_TOPUPS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000];

export default function Billing() {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(PRESET_TOPUPS[1]);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payNotice, setPayNotice] = useState<string | null>(null);

  const refreshWallet = async () => {
    const w = await whapi.get<WalletDto>('/wallet');
    setWallet(w);
    return w;
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshWallet();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load wallet');
      }
      try {
        const inv = await whapi.get<{ invoices: InvoiceDto[] }>('/invoices');
        if (Array.isArray(inv?.invoices)) setInvoices(inv.invoices);
      } catch { /* invoices are non-critical to this page */ }
    })();
  }, []);

  const currency = wallet?.currency ?? 'INR';
  const balanceCents = wallet?.balanceCents ?? null;
  const perMinCents = wallet?.perMinuteRateCents ?? null;
  const minutesLeft = balanceCents != null && perMinCents != null && perMinCents > 0
    ? balanceCents / perMinCents
    : null;

  const handleTopUp = async () => {
    if (!wallet?.topUpAvailable || !wallet.razorpayKeyId) return;
    setPayBusy(true); setPayError(null); setPayNotice(null);
    try {
      await loadRazorpay();
      const order = await whapi.post<{ orderId: string; amountCents: number; currency: string; razorpayKeyId: string }>(
        '/wallet/topup', { amountCents: topUpAmount },
      );
      const result = await openCheckout({
        orderId: order.orderId,
        amountCents: order.amountCents,
        currency: order.currency,
        razorpayKeyId: order.razorpayKeyId,
      });
      // Confirms the signature so the UI can report the outcome honestly. The
      // CREDIT is applied by the server's webhook, so the balance can lag by a
      // moment - we never claim credited unless the server says so.
      const v = await whapi.post<{ credited: boolean; message: string }>('/wallet/topup/verify', result);
      setPayNotice(v.message);
      await refreshWallet();
      if (!v.credited) {
        setTimeout(() => { refreshWallet().catch(() => {}); }, 3000);
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'DISMISSED') {
        // Closing the modal is a normal outcome, not an error - and the payment
        // may even be in flight, so re-read rather than asserting nothing happened.
        setPayNotice('Payment cancelled.');
        refreshWallet().catch(() => {});
      } else {
        setPayError(err.message || 'Payment could not be completed');
      }
    } finally {
      setPayBusy(false);
    }
  };

  const minTopUp = wallet?.minTopUpCents ?? 10_000;
  const maxTopUp = wallet?.maxTopUpCents ?? 5_000_000;
  const amountInvalid = topUpAmount < minTopUp || topUpAmount > maxTopUp;

  return (
    <>
      <div className="billing-page-header" style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Balance</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Your wallet is charged per talk-minute. Top up any amount — there is no plan and nothing renews.
        </p>
      </div>

      {/* Balance, rate, runway. Three facts, in the order they get asked. */}
      <div className="billing-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '40px' }}>
        <div className="billing-stat-card" style={statCard}>
          <h4 style={statLabel}>💲 Current balance</h4>
          <div className="stat-value" style={statValue}>
            {balanceCents == null ? '—' : fmt(balanceCents, currency)}
          </div>
          <div style={statNote}>
            {loadError
              ? `Couldn’t load balance: ${loadError}`
              : balanceCents != null && balanceCents <= 0
                ? 'Balance empty — new calls are blocked until you top up.'
                : 'Live balance from your workspace wallet'}
          </div>
        </div>

        <div className="billing-stat-card" style={statCard}>
          <h4 style={statLabel}>⏱️ Your rate</h4>
          <div className="stat-value" style={statValue}>
            {perMinCents == null ? '—' : `${fmt(perMinCents, currency)}`}
          </div>
          <div style={statNote}>
            Per talk-minute, all in — speech, model, voice and the phone line.
          </div>
        </div>

        <div className="billing-stat-card" style={statCard}>
          <h4 style={statLabel}>📞 Talk-time left</h4>
          <div className="stat-value" style={statValue}>
            {minutesLeft == null ? '—' : `~ ${Math.max(0, Math.floor(minutesLeft)).toLocaleString('en-IN')} min`}
          </div>
          <div style={statNote}>
            {minutesLeft == null
              ? 'Available once your balance and rate are known'
              : `At ${fmt(perMinCents!, currency)}/min on your current balance`}
          </div>
        </div>
      </div>

      <div className="billing-wallet-section" style={{ position: 'relative', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Wallet</h2>
          <button className="billing-topup-btn" style={{
            background: 'var(--teal)',
            border: '1px solid var(--teal)',
            color: '#04211f',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }} onClick={() => { setPayError(null); setPayNotice(null); setShowTopUp(true); }}>
            + Top up
          </button>
        </div>

        {showTopUp && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowTopUp(false)}>
            <div style={{ background: 'var(--bg-card, #111827)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 420, width: '92%' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 10, fontSize: 17 }}>Top up credits</h3>
              {wallet?.topUpAvailable ? (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
                    Pay by UPI, card or netbanking. Your balance updates once the payment is confirmed by our payment provider.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                    {PRESET_TOPUPS.map(amt => (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(amt)}
                        disabled={payBusy}
                        style={{
                          padding: '10px', borderRadius: 8, cursor: payBusy ? 'not-allowed' : 'pointer',
                          border: `1px solid ${topUpAmount === amt ? 'var(--teal)' : 'var(--border)'}`,
                          background: topUpAmount === amt ? 'rgba(0,212,200,0.12)' : 'transparent',
                          color: 'var(--text-primary, #fff)', fontWeight: topUpAmount === amt ? 700 : 400,
                        }}
                      >{fmt(amt, currency)}</button>
                    ))}
                  </div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Or enter an amount ({currency})
                  </label>
                  <input
                    type="number"
                    min={minTopUp / 100}
                    max={maxTopUp / 100}
                    step="1"
                    value={topUpAmount / 100}
                    disabled={payBusy}
                    onChange={e => {
                      const major = Number(e.target.value);
                      if (Number.isFinite(major)) setTopUpAmount(Math.round(major * 100));
                    }}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8, marginBottom: 12,
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--text-primary, #fff)', fontSize: 14,
                    }}
                  />
                  {/* What the money buys, in the unit the customer thinks in. */}
                  {!amountInvalid && perMinCents != null && perMinCents > 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
                      Buys about {Math.floor(topUpAmount / perMinCents).toLocaleString('en-IN')} minutes.
                    </div>
                  )}
                  {amountInvalid && (
                    <div style={{ color: '#f59e0b', fontSize: 12, marginBottom: 10 }}>
                      Enter between {fmt(minTopUp, currency)} and {fmt(maxTopUp, currency)}.
                    </div>
                  )}
                  {payError && (
                    <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{payError}</div>
                  )}
                  <button
                    onClick={handleTopUp}
                    disabled={payBusy || amountInvalid}
                    style={{
                      width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                      background: (payBusy || amountInvalid) ? 'rgba(0,212,200,0.4)' : 'var(--teal)',
                      color: '#04211f', fontWeight: 700,
                      cursor: payBusy ? 'wait' : amountInvalid ? 'not-allowed' : 'pointer',
                    }}
                  >{payBusy ? 'Opening payment…' : `Pay ${fmt(topUpAmount, currency)}`}</button>
                </>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                  {wallet?.topUpUnavailableReason || 'Online payments are not configured on this deployment.'}
                  <br /><br />
                  Your live balance and full transaction ledger are tracked server-side. An admin can credit your wallet in the meantime.
                </p>
              )}
              <button onClick={() => setShowTopUp(false)} style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary, #fff)', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )}

        {payNotice && (
          <div style={{ border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#22c55e' }}>
            {payNotice}
          </div>
        )}
        {payError && !showTopUp && (
          <div style={{ border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#f87171' }}>
            {payError}
          </div>
        )}

        {/* Transaction ledger */}
        {wallet && wallet.transactions.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, marginBottom: 10 }}>Recent transactions</h4>
            {wallet.transactions.slice(0, 8).map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(t.createdAt).toLocaleString()} · {t.type}{t.note ? ` — ${t.note}` : ''}</span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ color: t.amountCents >= 0 ? '#22c55e' : '#f87171', fontWeight: 600 }}>
                    {t.amountCents >= 0 ? '+' : '−'}{fmt(Math.abs(t.amountCents), currency)}
                  </span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{fmt(t.balanceAfterCents, currency)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {wallet && wallet.transactions.length === 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            No transactions yet. Top up to start placing calls — every credit and every call charge appears here, one line each.
          </div>
        )}

        {/* Invoices - wires up the previously unused Invoice model. */}
        {invoices.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, marginBottom: 10 }}>Invoices</h4>
            {invoices.slice(0, 10).map(inv => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {inv.number ?? inv.id.slice(0, 8)} · {new Date(inv.invoiceDate).toLocaleDateString()} · {inv.planName}
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  {fmt(inv.amountCents, inv.currency)}
                  <span style={{ color: inv.status === 'Paid' ? '#22c55e' : 'var(--text-muted)', marginLeft: 8 }}>{inv.status}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
          Rented phone numbers are billed separately at the carrier’s monthly rate.
          Calls stop when the balance runs out and resume the moment you top up.
        </p>

        <style>{`
          @media (max-width: 768px) {
            .billing-page-header h1 { font-size: 22px !important; }
            .billing-stats-grid {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
              margin-bottom: 32px !important;
            }
            .billing-stat-card { padding: 16px !important; }
            .billing-stat-card h4 { font-size: 11px !important; }
            .billing-stat-card .stat-value { font-size: 20px !important; }
            .billing-wallet-section { margin-bottom: 32px !important; }
            .billing-wallet-section h2 { font-size: 18px !important; }
          }

          @media (max-width: 480px) {
            .billing-stats-grid { gap: 10px !important; }
            .billing-stat-card { padding: 14px !important; }
          }
        `}</style>
      </div>
    </>
  );
}

const statCard: React.CSSProperties = {
  border: '1px solid rgba(0, 212, 200, 0.3)',
  borderRadius: '8px',
  padding: '24px',
  background: 'rgba(255,255,255,0.02)',
  textAlign: 'center',
};

const statLabel: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 600,
  marginBottom: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
};

const statValue: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: 'var(--teal-fg)',
  marginBottom: '8px',
};

const statNote: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '11px',
  lineHeight: 1.5,
};
