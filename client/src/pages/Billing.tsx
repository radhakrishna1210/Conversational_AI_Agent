import { useEffect, useState } from 'react';
import { whapi } from '../lib/whapi';
import { loadRazorpay, openCheckout } from '../lib/razorpayCheckout';

interface PlanDto {
  id: string; name: string;
  priceUsd: number; perMinuteUsd: number;
  // Price of record for this deployment. Null on a plan created before INR
  // pricing existed, in which case the server falls back to priceUsd x FX.
  priceInr: number | null; perMinuteInr: number | null;
  includedMinutes: number; kbStorageMb: number; features: string[]; sortOrder: number;
}

/** A plan's price in wallet minor units — INR-native, falling back to USD x FX.
 *  Mirrors planPriceMinor() on the server so the page never advertises a figure
 *  different from the one that will actually be debited. */
const planPriceCents = (p: Pick<PlanDto, 'priceInr' | 'priceUsd'>) =>
  p.priceInr != null ? Math.round(p.priceInr * 100) : Math.round(p.priceUsd * 96 * 100);
const planRateCents = (p: Pick<PlanDto, 'perMinuteInr' | 'perMinuteUsd'>) =>
  p.perMinuteInr != null ? p.perMinuteInr * 100 : p.perMinuteUsd * 96 * 100;
interface TxnDto { id: string; amountCents: number; balanceAfterCents: number; type: string; note: string | null; createdAt: string }
interface SubscriptionDto {
  status: string; planName: string; currentPeriodEnd: string;
  minutesIncluded: number; minutesUsed: number; cancelAtPeriodEnd: boolean; pendingPlanId: string | null;
}
interface WalletDto {
  balanceCents: number; currency: string; transactions: TxnDto[];
  topUpAvailable: boolean; topUpUnavailableReason?: string | null;
  razorpayKeyId?: string | null; minTopUpCents: number; maxTopUpCents: number;
  plan: { id: string; name: string; perMinuteUsd: number } | null;
  subscription: SubscriptionDto | null;
}
interface InvoiceDto { id: string; number: string | null; amountCents: number; currency: string; status: string; invoiceDate: string; planName: string; type: string }

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

// Paise. Spans the plan catalogue: the top preset must cover the most expensive
// plan (Growth, $399 x 96 = 38,304) or the sheet cannot fund the very upgrade
// that opened it.
const PRESET_TOPUPS = [50_000, 100_000, 500_000, 1_000_000, 2_500_000, 4_000_000];

export default function Billing() {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(PRESET_TOPUPS[1]);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payNotice, setPayNotice] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  // Usage-credit flow only. Plan purchases no longer route through the wallet,
  // so nothing sets this from a plan change any more.
  const [topUpFor, setTopUpFor] = useState<{ planName: string; neededCents: number } | null>(null);

  /** Re-read the plan catalogue. Extracted so a stale list can be recovered
   *  without a page reload — plans can be deleted or deactivated by an admin
   *  while a customer has this page open, and the buttons then reference ids
   *  that no longer exist. */
  const refreshPlans = async () => {
    try {
      const res = await fetch('/api/v1/config/plans');
      const data = await res.json();
      if (Array.isArray(data?.plans)) { setPlans(data.plans); return data.plans as PlanDto[]; }
    } catch { /* plans stay as they are; the grid shows a fallback message */ }
    return null;
  };

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
      await refreshPlans();
      try {
        const inv = await whapi.get<{ invoices: InvoiceDto[] }>('/invoices');
        if (Array.isArray(inv?.invoices)) setInvoices(inv.invoices);
      } catch { /* invoices are non-critical to this page */ }
    })();
  }, []);

  const currency = wallet?.currency ?? 'INR';
  const balanceCents = wallet?.balanceCents ?? null;
  // The plan the workspace is ACTUALLY on, reported by the server. This used to
  // read `plans[0]` - whichever plan happened to sort first - so every
  // workspace was shown the cheapest plan's name and per-minute rate no matter
  // what they were really subscribed to.
  const currentPlan = wallet?.subscription?.planName ?? wallet?.plan?.name ?? 'Free';
  const currentPlanDto = plans.find(p => p.name === currentPlan);
  const perMinCents = currentPlanDto
    ? planRateCents(currentPlanDto)
    : (wallet?.plan?.perMinuteUsd ?? 0.12) * 96 * 100;
  const minutesLeft = balanceCents != null && perMinCents > 0 ? balanceCents / perMinCents : null;

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

  /**
   * Buy or change a plan. Pays by CARD for exactly the plan price (or the
   * prorated upgrade amount) and does NOT require, spend, or check wallet
   * balance. The wallet is prepaid credit for call USAGE; making customers
   * pre-fund it just to buy a plan was a two-step chore with no benefit they
   * could see.
   *
   * Downgrades and free plans collect nothing, so the server applies those
   * immediately and reports that no payment is needed.
   */
  const handleChangePlan = async (planId: string, planName: string) => {
    setPlanBusy(planId); setPayError(null); setPayNotice(null);
    try {
      const quote = await whapi.post<{
        requiresPayment: boolean; message?: string;
        orderId?: string; amountCents?: number; currency?: string;
        razorpayKeyId?: string; kind?: string; planName?: string;
      }>('/subscription/checkout', { planId });

      if (!quote.requiresPayment) {
        setPayNotice(quote.message || `You are now on ${planName}.`);
        await refreshWallet();
        return;
      }

      await loadRazorpay();
      const result = await openCheckout({
        orderId: quote.orderId!,
        amountCents: quote.amountCents!,
        currency: quote.currency!,
        razorpayKeyId: quote.razorpayKeyId!,
        workspaceName: `${quote.planName ?? planName} plan`,
      });

      // Same verify endpoint as a top-up: it confirms the payment with Razorpay
      // directly and then activates the plan. This callback is never trusted on
      // its own, and the webhook covers the case where it never arrives.
      const v = await whapi.post<{ credited: boolean; message: string }>(
        '/wallet/topup/verify', result,
      );
      setPayNotice(v.message);
      await refreshWallet();
      if (!v.credited) setTimeout(() => { refreshWallet().catch(() => {}); }, 3000);
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err.code === 'DISMISSED') {
        // Closing the payment sheet is a normal outcome, not a failure - and
        // the payment may be in flight, so re-read rather than assert.
        setPayNotice('Payment cancelled.');
        refreshWallet().catch(() => {});
      } else if (err.status === 404) {
        // The plan id this button carries no longer exists — the catalogue
        // changed while the page was open. Re-read it and say so plainly,
        // rather than surfacing a bare "Plan not found" the customer cannot act on.
        await refreshPlans();
        setPayError('That plan is no longer available. The plan list has been refreshed — please try again.');
      } else {
        setPayError(err.message || 'Could not change plan');
      }
    } finally {
      setPlanBusy(null);
    }
  };

  return (
    <>
      <div className="billing-page-header" style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Balance & Plans</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          View your balance and choose right plan
        </p>
      </div>

      {/* Top Stats Cards */}
      <div className="billing-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '48px' }}>
        <div className="billing-stat-card" style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '24px', 
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            ✨ Active Plan
          </h4>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>{currentPlan}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Voice AI Cost : ~ {fmt(perMinCents, currency)} / min
            {wallet?.subscription && wallet.subscription.minutesIncluded > 0 && (
              <><br />{Math.max(0, wallet.subscription.minutesIncluded - wallet.subscription.minutesUsed).toFixed(0)} of {wallet.subscription.minutesIncluded} included minutes left</>
            )}
            {wallet?.subscription?.cancelAtPeriodEnd && (
              <><br /><span style={{ color: '#f59e0b' }}>Ends {new Date(wallet.subscription.currentPeriodEnd).toLocaleDateString()}</span></>
            )}
          </div>
        </div>

        <div className="billing-stat-card" style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '24px', 
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            💲 Current Balance
          </h4>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>
            {balanceCents == null ? '—' : fmt(balanceCents, currency)}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            {loadError
              ? `Couldn’t load balance: ${loadError}`
              : balanceCents != null && balanceCents <= 0
                ? 'Balance empty — new calls are blocked until you top up.'
                : minutesLeft == null
                  ? 'Live balance from your workspace wallet'
                  : `~ ${minutesLeft.toFixed(0)} minutes left at ${fmt(perMinCents, currency)}/min`}
          </div>
        </div>

        <div className="billing-stat-card" style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '24px', 
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            🗂️ KB usage
          </h4>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>0 used / 5 MB</div>
        </div>
      </div>

      {/* Voice AI Pricing Section */}
      <div className="billing-pricing-section" style={{ position: 'relative', marginBottom: '48px' }}>
        <div className="billing-pricing-header" style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>Voice AI Pricing</h2>
          <span style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '4px 12px', 
            borderRadius: '12px', 
            fontSize: '11px', 
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}>Billed monthly</span>
        </div>

        <button className="billing-topup-btn" style={{
          position: 'absolute',
          top: '0',
          right: '0',
          background: 'transparent',
          border: '1px solid var(--teal)',
          color: 'var(--teal)',
          padding: '8px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer'
        }} onClick={() => { setPayError(null); setPayNotice(null); setTopUpFor(null); setShowTopUp(true); }}>
          + Top Up Credits
        </button>

        {showTopUp && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowTopUp(false)}>
            <div style={{ background: 'var(--bg-card, #111827)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 420, width: '92%' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 10, fontSize: 17 }}>Top up credits</h3>
              {wallet?.topUpAvailable ? (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: topUpFor ? 8 : 14 }}>
                    Pay by UPI, card or netbanking. Your balance updates once the payment is confirmed by our payment provider.
                  </p>
                  {topUpFor && (
                    <p style={{ color: 'var(--teal)', fontSize: 13, marginBottom: 14 }}>
                      {topUpFor.planName} needs at least {fmt(topUpFor.neededCents, currency)} more.
                    </p>
                  )}
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
                    min={(wallet?.minTopUpCents ?? 10_000) / 100}
                    max={(wallet?.maxTopUpCents ?? 5_000_000) / 100}
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
                  {(topUpAmount < (wallet?.minTopUpCents ?? 10_000) || topUpAmount > (wallet?.maxTopUpCents ?? 5_000_000)) && (
                    <div style={{ color: '#f59e0b', fontSize: 12, marginBottom: 10 }}>
                      Enter between {fmt(wallet?.minTopUpCents ?? 10_000, currency)} and {fmt(wallet?.maxTopUpCents ?? 5_000_000, currency)}.
                    </div>
                  )}
                  {payError && (
                    <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{payError}</div>
                  )}
                  {(() => {
                    const min = wallet?.minTopUpCents ?? 10_000;
                    const max = wallet?.maxTopUpCents ?? 5_000_000;
                    const invalid = topUpAmount < min || topUpAmount > max;
                    return (
                      <button
                        onClick={handleTopUp}
                        disabled={payBusy || invalid}
                        style={{
                          width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                          background: (payBusy || invalid) ? 'rgba(0,212,200,0.4)' : 'var(--teal)',
                          color: '#04211f', fontWeight: 700,
                          cursor: payBusy ? 'wait' : invalid ? 'not-allowed' : 'pointer',
                        }}
                      >{payBusy ? 'Opening payment…' : `Pay ${fmt(topUpAmount, currency)}`}</button>
                    );
                  })()}
                </>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                  {wallet?.topUpUnavailableReason || 'Online payments are not configured on this deployment.'}
                  <br /><br />
                  Your live balance and full transaction ledger are tracked server-side. An admin can credit your wallet in the meantime.
                </p>
              )}
              <button onClick={() => { setShowTopUp(false); setTopUpFor(null); }} style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary, #fff)', cursor: 'pointer' }}>Close</button>
            </div>
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

        <div className="billing-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {plans.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: 13 }}>
              Plans are loading… (managed by your admin in Admin Panel → Plans)
            </div>
          ) : plans.map((p, i) => (
            <PricingCard
              key={p.id}
              name={p.name}
              price={planPriceCents(p) === 0 ? 'Free' : fmt(planPriceCents(p), currency)}
              desc={p.features[0] || ''}
              cost={fmt(planRateCents(p), currency)}
              mins={String(p.includedMinutes)}
              kb={`${p.kbStorageMb} MB knowledge base`}
              extra={p.features.slice(1).join(' · ')}
              highlight={i === 2}
              isCurrent={p.name === currentPlan}
              // A cheaper plan is a downgrade and is DEFERRED to the end of the
              // billing period, so calling it "Upgrade" would misrepresent both
              // the price and when it takes effect.
              actionLabel={
                p.name === currentPlan ? 'Current plan'
                  : planPriceCents(p) < (currentPlanDto ? planPriceCents(currentPlanDto) : 0) ? 'Downgrade'
                    : 'Upgrade'
              }
              busy={planBusy === p.id}
              disabled={planBusy !== null}
              onSelect={() => handleChangePlan(p.id, p.name)}
            />
          ))}
        </div>

        {/* Flexible Model Selection Banner */}
        <div className="billing-model-banner" style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '16px 24px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: 'rgba(0, 212, 200, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--teal)', fontSize: '20px' }}>⚙️</span>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Flexible Model Selection</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>You can use any combination of supported models for your Voice AI agents.</div>
            </div>
          </div>
          <button style={{ 
            background: 'transparent', 
            border: '1px solid var(--text-muted)', 
            color: 'var(--text-primary)', 
            padding: '6px 12px', 
            borderRadius: '6px', 
            fontSize: '11px', 
            fontWeight: 600,
            cursor: 'pointer' 
          }}>
            Show Available Models
          </button>
        </div>
      </div>

      {/* Chatbot Pricing */}
      <div className="billing-chatbot-section" style={{ marginBottom: '48px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Chatbot Pricing</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Simple per-message pricing for all plans</p>
        </div>
        
        <div className="billing-table-wrapper">
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(120px, auto) repeat(5, 1fr)', 
          border: '1px solid var(--border)', 
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Starter</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Jump Starter</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Early deployers</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Growth</div>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Enterprise</div>

          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center' }}>Cost</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-primary)', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-primary)', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-primary)', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-primary)', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-primary)', fontSize: '12px' }}>custom</div>
        </div>
        </div>
      </div>

      {/* Features Table */}
      <div className="billing-features-section" style={{ marginBottom: '48px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Features</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Compare features across all plans</p>
        </div>

        <div className="billing-table-wrapper">
        <div className="billing-features-table" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(200px, 1.5fr) repeat(5, 1fr)', 
          border: '1px solid var(--border)', 
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.01)'
        }}>
          {/* Header Row */}
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Features</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Starter</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Jump Starter</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Early deployers</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Growth</div>
          <div style={{ padding: '24px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Enterprise</div>

          {/* Feature Rows */}
          <FeatureRow name="Built-in CRM" vals={['x', 'x', 'x', 'x', 'v']} />
          <FeatureRow name="Dedicated support" vals={['Email', 'Email', 'Email', 'Email', 'Email / Whatsapp / Slack']} />
          <FeatureRow name="Train assistant from call recording" vals={['x', 'x', 'x', 'x', 'v']} />
          <FeatureRow name="Voicemail Detection" vals={['$ 0.0085 / minute', '$ 0.0085 / minute', '$ 0.0085 / minute', '$ 0.0085 / minute', 'custom']} />
          <FeatureRow name="Post call" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Call transfer" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Call analytics" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Import phone number" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Realtime web search" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Noise reducer" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Background sound effect" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="One-click integrations" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="Chatbot integration" vals={['v', 'v', 'v', 'v', 'v']} />
          <FeatureRow name="API access" vals={['v', 'v', 'v', 'v', 'v']} noBorder />

        </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="billing-additional-info" style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        padding: '24px', 
        background: 'rgba(255,255,255,0.02)' 
      }}>
        <h4 style={{ color: '#fb923c', fontSize: '13px', fontWeight: 600, margin: '0 0 16px 0' }}>Additional Information</h4>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.6 }}>
          <strong>Token Limit:</strong> Agent prompts should be under 3,500 tokens for optimal performance.<br/>
          <strong>Telephony Fees:</strong> Additional fees apply for calls from Conversational AI Agent numbers.
        </div>


      {/* ════════════════════════════════════════════
          RESPONSIVE STYLES
         ════════════════════════════════════════════ */}
      <style>{`
        /* ── Tablet (769px - 1024px) ── */
        @media (max-width: 1024px) {
          /* Stats cards: 2 columns on tablet */
          .billing-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          /* Pricing cards: 3 columns on tablet */
          .billing-pricing-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
          /* Tables: allow horizontal scroll */
          .billing-table-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .billing-table-wrapper > div {
            min-width: 700px;
          }
        }

        /* ── Mobile (max-width: 768px) ── */
        @media (max-width: 768px) {
          /* Page header */
          .billing-page-header h1 {
            font-size: 22px !important;
          }
          .billing-page-header p {
            font-size: 13px !important;
          }

          /* Stats cards: single column, full width */
          .billing-stats-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            margin-bottom: 32px !important;
          }
          .billing-stat-card {
            padding: 16px !important;
          }
          .billing-stat-card h4 {
            font-size: 11px !important;
          }
          .billing-stat-card .stat-value {
            font-size: 20px !important;
          }

          /* Voice AI Pricing section */
          .billing-pricing-section {
            margin-bottom: 32px !important;
          }
          .billing-pricing-section h2 {
            font-size: 20px !important;
          }
          /* Top Up button: move below heading, not absolute */
          .billing-topup-btn {
            position: static !important;
            margin: 16px auto 0 !important;
            display: block !important;
            width: fit-content !important;
          }
          .billing-pricing-header {
            margin-bottom: 16px !important;
          }

          /* Pricing cards: single column */
          .billing-pricing-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .billing-pricing-card {
            padding: 20px !important;
          }
          .billing-pricing-card .plan-name {
            font-size: 13px !important;
          }
          .billing-pricing-card .plan-price {
            font-size: 24px !important;
          }

          /* Flexible Model Banner */
          .billing-model-banner {
            flex-direction: column !important;
            gap: 12px !important;
            text-align: center !important;
            padding: 16px !important;
          }
          .billing-model-banner > div {
            flex-direction: column !important;
            text-align: center !important;
          }

          /* Chatbot Pricing */
          .billing-chatbot-section h2 {
            font-size: 20px !important;
          }
          .billing-table-wrapper {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
            border-radius: 8px;
          }
          .billing-table-wrapper > div {
            min-width: 600px;
          }

          /* Features table */
          .billing-features-section h2 {
            font-size: 20px !important;
          }
          .billing-features-table {
            min-width: 700px;
          }

          /* Additional Info */
          .billing-additional-info {
            padding: 16px !important;
          }
          .billing-additional-info h4 {
            font-size: 12px !important;
          }
        }

        /* ── Extra small mobile (max-width: 480px) ── */
        @media (max-width: 480px) {
          .billing-stats-grid {
            gap: 10px !important;
          }
          .billing-stat-card {
            padding: 14px !important;
          }
          .billing-pricing-card {
            padding: 16px !important;
          }
          .billing-pricing-card .plan-price {
            font-size: 22px !important;
          }
        }
      `}</style>
      </div>

    </>
  );
}

// Helper components to keep the main file cleaner
function PricingCard({ name, price, oldPrice, badge, desc, cost, mins, extra, kb, highlight, isCurrent, actionLabel, busy, disabled, onSelect }: any) {
  return (
    <div className="billing-pricing-card" style={{ 
      border: highlight ? '1px solid var(--teal)' : '1px solid var(--border)', 
      borderRadius: '8px', 
      padding: '24px', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'rgba(255,255,255,0.02)',
      position: 'relative'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div className="plan-name" style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>{name}</div>
        
        {badge && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '12px' }}>${oldPrice}</span>
            <span style={{ background: 'var(--teal)', color: 'var(--bg-primary)', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{badge}</span>
          </div>
        )}

        <div className="plan-price" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
          {/* `price` arrives already formatted in the wallet's currency. The
              hardcoded '$' that used to live here advertised dollars while the
              wallet was debited in rupees. */}
          {price}
          {price !== 'Free' && (
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>/month</span>
          )}
        </div>
      </div>
      
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5, flexGrow: 1 }}>{desc}</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', fontSize: '11px', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Cost</span><span>{cost}/min</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Minutes</span><span>~ {mins} minutes</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--text-muted)' }}>Extra Usage</span>
          <span style={{ textAlign: 'right' }}><span style={{color:'var(--text-muted)', fontSize:'9px', display:'block'}}>Billed</span>{extra}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Knowledge base</span><span>{kb} MB</span></div>
      </div>
      
      <button
        className="btn btn-primary"
        onClick={onSelect}
        disabled={isCurrent || busy || disabled}
        style={{
          width: '100%', padding: '10px', fontSize: '13px',
          opacity: isCurrent ? 0.55 : disabled && !busy ? 0.7 : 1,
          cursor: isCurrent ? 'default' : busy ? 'wait' : disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Working…' : (actionLabel ?? 'Upgrade')}
      </button>
    </div>
  );
}

function FeatureRow({ name, vals, noBorder }: any) {
  const getVal = (val: string) => {
    if (val === 'v') return <span style={{ color: 'var(--teal)' }}>✓</span>;
    if (val === 'x') return <span style={{ color: '#ef4444' }}>×</span>; // Red cross
    return val;
  };

  return (
    <>
      <div style={{ padding: '16px', borderRight: '1px solid var(--border)', borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
        {name}
      </div>
      {vals.map((v: string, i: number) => (
        <div key={i} style={{ 
          padding: '16px', 
          borderRight: i === vals.length - 1 ? 'none' : '1px solid var(--border)', 
          borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)', 
          textAlign: 'center', 
          color: 'var(--text-muted)', 
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {getVal(v)}
        </div>
      ))}
    </>
  );
}