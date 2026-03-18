export default function Billing() {
  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Balance & Plans</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          View your balance and choose right plan
        </p>
      </div>

      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '48px' }}>
        <div style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '24px', 
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            ✨ Active Plan
          </h4>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>Free</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Voice AI Cost : ~ $ 0.114 / min</div>
        </div>

        <div style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '24px', 
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            💲 Current Balance
          </h4>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>$ 1.200</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>~ 10.45 Minutes left</div>
        </div>

        <div style={{ 
          border: '1px solid rgba(0, 212, 200, 0.3)', 
          borderRadius: '8px', 
          padding: '24px', 
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            🗂️ KB usage
          </h4>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)', marginBottom: '8px' }}>0 used / 5 MB</div>
        </div>
      </div>

      {/* Voice AI Pricing Section */}
      <div style={{ position: 'relative', marginBottom: '48px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: 'white' }}>Voice AI Pricing</h2>
          <span style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '4px 12px', 
            borderRadius: '12px', 
            fontSize: '11px', 
            fontWeight: 600,
            color: 'white'
          }}>Billed monthly</span>
        </div>

        <button style={{
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
        }}>
          + Top Up Credits. (UPI Available)
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {/* Plan 1 */}
          <PricingCard 
            name="Starter" 
            price="15" 
            desc="Best for quick experimentations" 
            cost="0.104" mins="144" extra="0.104" kb="5" 
          />
          {/* Plan 2 */}
          <PricingCard 
            name="Jump Starter" 
            price="30" 
            desc="Best for building and sharing voice AI demos." 
            cost="0.095" mins="316" extra="0.095" kb="10" 
          />
          {/* Plan 3 (Highlight) */}
          <PricingCard 
            name="Early deployers" 
            price="36" 
            oldPrice="40"
            badge="10% OFF"
            desc="Best for users doing a POC with a live voice AI agent." 
            cost="0.085" mins="471" extra="0.085" kb="50" 
            highlight
          />
          {/* Plan 4 */}
          <PricingCard 
            name="Growth" 
            price="200" 
            desc="Best for users scaling post-POC voice AI usage." 
            cost="0.070" mins="2857" extra="0.070" kb="100" 
          />
          {/* Plan 5 (Enterprise) */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'white' }}>Enterprise</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'white' }}>Custom <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>pricing</span></div>
              <div style={{ fontSize: '11px', color: 'var(--teal)', marginTop: '8px' }}>(As low as $0.05/min or ₹4.0/min)</div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5, flexGrow: 1 }}>
              Launch at scale with volume-based discounts.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', fontSize: '11px', color: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Agent Training from Recording</span><span style={{color:'var(--teal)'}}>✓</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Dedicated support</span><span style={{color:'var(--teal)'}}>✓</span></div>
            </div>
            <button className="btn" style={{ background: 'transparent', border: '1px solid var(--teal)', color: 'var(--teal)', width: '100%', padding: '10px', fontSize: '13px' }}>
              ✉️ Contact Us
            </button>
          </div>
        </div>

        {/* Flexible Model Selection Banner */}
        <div style={{ 
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
              <div style={{ color: 'white', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Flexible Model Selection</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>You can use any combination of supported models for your Voice AI agents.</div>
            </div>
          </div>
          <button style={{ 
            background: 'transparent', 
            border: '1px solid var(--text-muted)', 
            color: 'white', 
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
      <div style={{ marginBottom: '48px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'white' }}>Chatbot Pricing</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Simple per-message pricing for all plans</p>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(120px, auto) repeat(5, 1fr)', 
          border: '1px solid var(--border)', 
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'white' }}>Starter</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'white' }}>Jump Starter</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'white' }}>Early deployers</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'white' }}>Growth</div>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontWeight: 700, color: 'white' }}>Enterprise</div>

          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', color: 'white', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center' }}>Cost</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'white', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'white', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'white', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', borderRight: '1px solid var(--border)', textAlign: 'center', color: 'white', fontSize: '12px' }}>$ 0.005 / message</div>
          <div style={{ padding: '24px', textAlign: 'center', color: 'white', fontSize: '12px' }}>custom</div>
        </div>
      </div>

      {/* Features Table */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'white' }}>Features</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Compare features across all plans</p>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(200px, 1.5fr) repeat(5, 1fr)', 
          border: '1px solid var(--border)', 
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.01)'
        }}>
          {/* Header Row */}
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'white', textAlign: 'center' }}>Features</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'white', textAlign: 'center' }}>Starter</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'white', textAlign: 'center' }}>Jump Starter</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'white', textAlign: 'center' }}>Early deployers</div>
          <div style={{ padding: '24px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'white', textAlign: 'center' }}>Growth</div>
          <div style={{ padding: '24px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'white', textAlign: 'center' }}>Enterprise</div>

          {/* Feature Rows */}
          <FeatureRow name="OmniCRM" vals={['x', 'x', 'x', 'x', 'v']} />
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

      {/* Additional Information */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        padding: '24px', 
        background: 'rgba(255,255,255,0.02)' 
      }}>
        <h4 style={{ color: '#fb923c', fontSize: '13px', fontWeight: 600, margin: '0 0 16px 0' }}>Additional Information</h4>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.6 }}>
          <strong>Token Limit:</strong> Agent prompts should be under 3,500 tokens for optimal performance.<br/>
          <strong>Telephony Fees:</strong> Additional fees apply for calls from OmniDimension numbers.
        </div>
      </div>

    </>
  );
}

// Helper components to keep the main file cleaner
function PricingCard({ name, price, oldPrice, badge, desc, cost, mins, extra, kb, highlight }: any) {
  return (
    <div style={{ 
      border: highlight ? '1px solid var(--teal)' : '1px solid var(--border)', 
      borderRadius: '8px', 
      padding: '24px', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'rgba(255,255,255,0.02)',
      position: 'relative'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'white' }}>{name}</div>
        
        {badge && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '12px' }}>${oldPrice}</span>
            <span style={{ background: 'var(--teal)', color: 'var(--bg-primary)', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{badge}</span>
          </div>
        )}

        <div style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>
          <span style={{ fontSize: '20px', verticalAlign: 'top' }}>$ </span>{price} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>/month</span>
        </div>
      </div>
      
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5, flexGrow: 1 }}>{desc}</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', fontSize: '11px', color: 'white' }}>
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
      <div style={{ padding: '16px', borderRight: '1px solid var(--border)', borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)', color: 'white', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
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
