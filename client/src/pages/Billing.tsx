import { useEffect, useState } from 'react';
import { whapi } from '../lib/whapi';
interface PlanDto { id: string; name: string; priceUsd: number; perMinuteUsd: number; includedMinutes: number; kbStorageMb: number; features: string[]; sortOrder: number }
interface WalletDto { balanceCents: number; currency: string; transactions: { id: string; amountCents: number; type: string; note: string | null; createdAt: string }[]; topUpAvailable: boolean; topUpUnavailableReason?: string }

export default function Billing() {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const w = await whapi.get<WalletDto>('/wallet');
        setWallet(w);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load wallet');
      }
      try {
        const res = await fetch('/api/v1/config/plans');
        const data = await res.json();
        if (Array.isArray(data?.plans)) setPlans(data.plans);
      } catch { /* plans stay empty; grid shows fallback message */ }
    })();
  }, []);

  const balanceUsd = wallet ? (wallet.balanceCents / 100) : null;
  const currentPlan = plans[0]?.name ?? 'Free';
  const perMin = plans.find(p => p.name === currentPlan)?.perMinuteUsd ?? 0.114;
  const minutesLeft = balanceUsd != null && perMin > 0 ? (balanceUsd / perMin) : null;

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
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>Free</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Voice AI Cost : ~ $ 0.114 / min</div>
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
            {balanceUsd == null ? '—' : `$ ${balanceUsd.toFixed(2)}`}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            {loadError ? `Couldn’t load balance: ${loadError}` : minutesLeft == null ? 'Live balance from your workspace wallet' : `~ ${minutesLeft.toFixed(1)} minutes left at $${perMin}/min`}
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
        }} onClick={() => setShowTopUp(true)}>
          + Top Up Credits
        </button>

        {showTopUp && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowTopUp(false)}>
            <div style={{ background: 'var(--bg-card, #111827)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 420, width: '92%' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 10, fontSize: 17 }}>Top up credits</h3>
              {wallet?.topUpAvailable ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Choose a payment method to continue.</p>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                  {wallet?.topUpUnavailableReason || 'Online payments are not configured yet.'}
                  <br /><br />
                  Your live balance and full transaction ledger are tracked server-side; once a payment gateway (UPI/Stripe/Razorpay) is connected, top-ups will appear here instantly.
                </p>
              )}
              <button onClick={() => setShowTopUp(false)} style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary, #fff)', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )}

        {/* Transaction ledger */}
        {wallet && wallet.transactions.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, marginBottom: 10 }}>Recent transactions</h4>
            {wallet.transactions.slice(0, 8).map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(t.createdAt).toLocaleString()} · {t.type}{t.note ? ` — ${t.note}` : ''}</span>
                <span style={{ color: t.amountCents >= 0 ? '#22c55e' : '#f87171', fontWeight: 600 }}>{t.amountCents >= 0 ? '+' : ''}{(t.amountCents / 100).toFixed(2)}</span>
              </div>
            ))}
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
              price={String(p.priceUsd)}
              desc={p.features[0] || ''}
              cost={p.perMinuteUsd.toFixed(3)}
              mins={String(p.includedMinutes)}
              kb={`${p.kbStorageMb} MB knowledge base`}
              extra={p.features.slice(1).join(' · ')}
              highlight={i === 2}
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
function PricingCard({ name, price, oldPrice, badge, desc, cost, mins, extra, kb, highlight }: any) {
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

        <div className="plan-price" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
          <span style={{ fontSize: '20px', verticalAlign: 'top' }}>$ </span>{price} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>/month</span>
        </div>
      </div>
      
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5, flexGrow: 1 }}>{desc}</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', fontSize: '11px', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Cost</span><span>$ {cost}/min</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Minutes</span><span>~ {mins} minutes</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--text-muted)' }}>Extra Usage</span>
          <span style={{ textAlign: 'right' }}><span style={{color:'var(--text-muted)', fontSize:'9px', display:'block'}}>Billed</span>= $ {extra}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Knowledge base</span><span>{kb} MB</span></div>
      </div>
      
      <button className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: '13px' }}>
        Upgrade
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