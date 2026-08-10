import { useEffect, useState } from 'react';
import { whapi } from '../lib/whapi';
import { loadRazorpay, openCheckout } from '../lib/razorpayCheckout';
import { RzCard, RzEmpty, RzMeter, RzPill, RzStat } from '@/components/rz';

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
 * The Account design in Spandan_flagship_selection leads with a "Current plan /
 * Growth / $99 a month" card. That card is deliberately NOT ported: it describes
 * a pricing model this product does not have. What is ported is everything the
 * design puts around it — the wallet hero, the usage tiles, the runway meter and
 * the invoice list — because those are the shapes a prepaid wallet needs.
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

/**
 * How full the runway meter reads.
 *
 * A wallet has no ceiling, so "percent of balance" is meaningless. What the
 * customer actually wants to know is whether they are about to run out, so the
 * meter is scaled against a month of light use (600 minutes) and clamped. It
 * turns coral below a fifth of that — the point where a busy afternoon could
 * empty it.
 */
const RUNWAY_FULL_MINUTES = 600;

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

  const runwayPct = minutesLeft == null ? 0 : Math.min(100, (minutesLeft / RUNWAY_FULL_MINUTES) * 100);
  const runwayLow = minutesLeft != null && minutesLeft < RUNWAY_FULL_MINUTES * 0.2;
  const empty = balanceCents != null && balanceCents <= 0;

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap" style={{ maxWidth: 920 }}>
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Account</div>
            <h1 className="rz-h1">Balance</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 620 }}>
              Your wallet is charged per talk-minute. Top up any amount — there is no plan and nothing renews.
            </p>
          </div>
          <div className="rz-head-actions">
            <button
              className="rz-btn rz-btn-primary"
              onClick={() => { setPayError(null); setPayNotice(null); setShowTopUp(true); }}
            >
              + Top up
            </button>
          </div>
        </div>

        {/* Wallet hero + runway */}
        <div className="rz-grid-main" style={{ marginBottom: 16 }}>
          <div
            className="rz-card rz-card-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(14,179,158,0.08), rgba(129,140,248,0.05))',
              borderColor: 'rgba(14,179,158,0.28)',
            }}
          >
            <div className="rz-between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="rz-eyebrow">Wallet balance</div>
                <div className="rz-h1" style={{ fontSize: 34, marginTop: 8 }}>
                  {balanceCents == null ? '—' : fmt(balanceCents, currency)}
                </div>
              </div>
              {balanceCents != null && (empty ? <RzPill tone="err">empty</RzPill> : <RzPill tone="ok" dot>active</RzPill>)}
            </div>

            <div className="rz-sub" style={{ marginTop: 6 }}>
              {loadError
                ? `Couldn’t load balance: ${loadError}`
                : empty
                  ? 'New calls are blocked until you top up.'
                  : minutesLeft != null
                    ? `≈ ${Math.max(0, Math.floor(minutesLeft)).toLocaleString('en-IN')} minutes of calling left`
                    : 'Live balance from your workspace wallet'}
            </div>

            <div style={{ marginTop: 16 }}>
              <RzMeter
                size="lg"
                segments={[{ pct: runwayPct, className: runwayLow ? 'rz-meter-fill-coral' : undefined }]}
              />
              <div className="rz-between rz-mono-xs" style={{ marginTop: 6 }}>
                <span>{runwayLow ? 'Running low' : 'Healthy runway'}</span>
                <span>{RUNWAY_FULL_MINUTES}+ min</span>
              </div>
            </div>

            <div className="rz-cluster-sm" style={{ marginTop: 16 }}>
              <button
                className="rz-btn rz-btn-primary"
                onClick={() => { setPayError(null); setPayNotice(null); setShowTopUp(true); }}
              >
                Add credit
              </button>
            </div>
          </div>

          <div className="rz-stack" style={{ gap: 14 }}>
            <RzStat
              label="YOUR RATE"
              value={perMinCents == null ? '—' : fmt(perMinCents, currency)}
              delta="per talk-minute, all in"
            />
            <RzStat
              label="TALK-TIME LEFT"
              value={minutesLeft == null ? '—' : `~${Math.max(0, Math.floor(minutesLeft)).toLocaleString('en-IN')} min`}
              delta={perMinCents != null ? `at ${fmt(perMinCents, currency)}/min` : undefined}
            />
          </div>
        </div>

        {payNotice && (
          <div className="rz-card" style={{ borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.08)', color: 'var(--lime)', fontSize: 13, marginBottom: 16 }}>
            {payNotice}
          </div>
        )}
        {payError && !showTopUp && (
          <div className="rz-card" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)', color: 'var(--err)', fontSize: 13, marginBottom: 16 }}>
            {payError}
          </div>
        )}

        {/* Ledger */}
        <RzCard flush title="Recent transactions" style={{ marginBottom: 16 }}>
          {wallet && wallet.transactions.length > 0 ? (
            <div>
              {wallet.transactions.slice(0, 10).map(t => (
                <div
                  key={t.id}
                  className="rz-between"
                  style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', gap: 12, fontSize: 13 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="rz-truncate" style={{ color: 'var(--tx)' }}>
                      {t.type}{t.note ? ` — ${t.note}` : ''}
                    </div>
                    <div className="rz-mono-xs">{new Date(t.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ color: t.amountCents >= 0 ? 'var(--lime)' : 'var(--err)', fontWeight: 600, fontFamily: 'var(--ff-m)' }}>
                      {t.amountCents >= 0 ? '+' : '−'}{fmt(Math.abs(t.amountCents), currency)}
                    </div>
                    <div className="rz-mono-xs">{fmt(t.balanceAfterCents, currency)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <RzEmpty
              title="No transactions yet"
              text="Top up to start placing calls — every credit and every call charge appears here, one line each."
            />
          )}
        </RzCard>

        {/* Invoices — wires up the previously unused Invoice model. */}
        {invoices.length > 0 && (
          <RzCard flush title="Invoices" style={{ marginBottom: 16 }}>
            <div className="rz-table-wrap">
              <table className="rz-table">
                <thead>
                  <tr><th>Invoice</th><th>Date</th><th>Amount</th><th className="rz-td-right">Status</th></tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 12).map(inv => (
                    <tr key={inv.id}>
                      <td className="rz-td-mono">{inv.number ?? inv.id.slice(0, 8)}</td>
                      <td>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                      <td className="rz-td-strong rz-td-mono">{fmt(inv.amountCents, inv.currency)}</td>
                      <td className="rz-td-right">
                        <RzPill tone={inv.status === 'Paid' ? 'ok' : 'warn'}>{inv.status}</RzPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RzCard>
        )}

        <p className="rz-mono" style={{ lineHeight: 1.7 }}>
          Rented phone numbers are billed separately at the carrier’s monthly rate.
          Calls stop when the balance runs out and resume the moment you top up.
        </p>
      </div>

      {/* Top-up dialog */}
      {showTopUp && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setShowTopUp(false)}
        >
          <div
            className="rz-card rz-card-lg rz-enter"
            style={{ maxWidth: 440, width: '100%', background: 'var(--s1)' }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Top up credits"
          >
            <div className="rz-title" style={{ fontSize: 17, marginBottom: 10 }}>Top up credits</div>

            {wallet?.topUpAvailable ? (
              <>
                <p className="rz-sub" style={{ margin: '0 0 14px' }}>
                  Pay by UPI, card or netbanking. Your balance updates once the payment is confirmed by our payment provider.
                </p>

                <div className="rz-grid-2" style={{ gap: 8, marginBottom: 14 }}>
                  {PRESET_TOPUPS.map(amt => (
                    <button
                      key={amt}
                      className={`rz-chip ${topUpAmount === amt ? 'is-active' : ''}`}
                      style={{ padding: '10px', textAlign: 'center', fontFamily: 'var(--ff-m)' }}
                      onClick={() => setTopUpAmount(amt)}
                      disabled={payBusy}
                    >
                      {fmt(amt, currency)}
                    </button>
                  ))}
                </div>

                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="topup-amount">Or enter an amount ({currency})</label>
                  <input
                    id="topup-amount"
                    className="rz-input"
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
                  />
                  {/* What the money buys, in the unit the customer thinks in. */}
                  {!amountInvalid && perMinCents != null && perMinCents > 0 && (
                    <div className="rz-field-hint">
                      Buys about {Math.floor(topUpAmount / perMinCents).toLocaleString('en-IN')} minutes.
                    </div>
                  )}
                  {amountInvalid && (
                    <div className="rz-field-error">
                      Enter between {fmt(minTopUp, currency)} and {fmt(maxTopUp, currency)}.
                    </div>
                  )}
                </div>

                {payError && <div className="rz-field-error" style={{ marginTop: 10 }}>{payError}</div>}

                <button
                  className="rz-btn rz-btn-primary rz-btn-block"
                  style={{ marginTop: 14 }}
                  onClick={handleTopUp}
                  disabled={payBusy || amountInvalid}
                >
                  {payBusy ? 'Opening payment…' : `Pay ${fmt(topUpAmount, currency)}`}
                </button>
              </>
            ) : (
              <p className="rz-sub">
                {wallet?.topUpUnavailableReason || 'Online payments are not configured on this deployment.'}
                <br /><br />
                Your live balance and full transaction ledger are tracked server-side. An admin can credit your wallet in the meantime.
              </p>
            )}

            <button className="rz-btn rz-btn-ghost rz-btn-block" style={{ marginTop: 10 }} onClick={() => setShowTopUp(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
