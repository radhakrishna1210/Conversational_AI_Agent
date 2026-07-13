import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface PlanDto { id: string; name: string; priceUsd: number; perMinuteUsd: number; includedMinutes: number; kbStorageMb: number; features: string[] }

export default function Pricing() {
  const [activeTab, setActiveTab] = useState('Plans');
  // Live plans from the admin-managed source of truth (falls back to nothing
  // rather than stale hardcoded numbers if the API is unreachable).
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  useEffect(() => {
    fetch('/api/v1/config/plans')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.plans)) setPlans(d.plans); })
      .catch(() => setPlans([]));
  }, []);

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <h1 style={{color:'var(--teal)'}}>Pricing</h1>
          <p>Choose the perfect plan for your business. Start free, scale as you grow, and only pay for what you use.</p>
          <div className="pricing-perks" style={{display:'flex', alignItems:'center', gap:'20px', justifyContent:'center', marginTop:'16px', fontSize:'13px', color:'var(--text-secondary)'}}>
            <span>✓ No setup fees</span>
            <span>✓ Cancel anytime</span>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="pricing-tabs">
          {['Plans', 'FAQ', 'Contact'].map(tab => (
            <button 
              key={tab} 
              className={`pricing-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Plans' && (
          <>
            <div style={{textAlign:'center', marginBottom:'24px'}}>
              <h2 style={{fontSize:'24px', fontWeight:800, marginBottom:'6px'}}>Voice AI Pricing</h2>
              <p style={{fontSize:'13px', color:'var(--text-secondary)'}}>Billed monthly</p>
              <div style={{marginTop:'12px'}}>
                <Link to="/contact" style={{display:'inline-flex', alignItems:'center', gap:'8px', background:'var(--bg-card)', border:'1px solid var(--border)', padding:'8px 16px', borderRadius:'20px', fontSize:'12px', color:'var(--text-secondary)', cursor:'pointer', textDecoration:'none'}}>
                  ↑ Custom Recharge Available (UPI)
                </Link>
              </div>
            </div>

            <div className="plan-cards animate-me">
              {plans === null ? (
                <div style={{ color: 'var(--text-muted)', padding: 24 }}>Loading plans…</div>
              ) : plans.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', padding: 24 }}>Plans are temporarily unavailable — please try again shortly.</div>
              ) : (
                plans.filter(p => p.priceUsd > 0).slice(0, 4).map((p, i) => (
                  <div key={p.id} className={`plan-card ${i === 1 ? 'featured' : ''}`}>
                    <div className="plan-name" style={i === 1 ? { color: 'var(--teal)' } : undefined}>{p.name}</div>
                    <div className="plan-price">
                      <span className="price-amount">${p.priceUsd}</span>
                      <span className="price-period">/month</span>
                    </div>
                    <div className="plan-desc">{p.features[0] || ''}</div>
                    <div className="plan-feature"><span className="label">Cost</span><span className="value">${p.perMinuteUsd.toFixed(3)}/min</span></div>
                    <div className="plan-feature"><span className="label">Minutes</span><span className="value">~{p.includedMinutes} minutes</span></div>
                    <div className="plan-feature"><span className="label">Knowledge base</span><span className="value">{p.kbStorageMb} MB</span></div>
                    <Link to="/signup"><button className={`btn ${i === 1 ? 'btn-primary' : 'btn-secondary'} plan-btn`}>Get Started</button></Link>
                  </div>
                ))
              )}

              {/* Enterprise */}
              <div className="plan-card" style={{borderColor: 'rgba(139,92,246,0.4)'}}>
                <div className="plan-name" style={{color:'#a78bfa'}}>Enterprise</div>
                <div className="plan-price">
                  <div style={{fontSize:'26px', fontWeight:900, color:'#a78bfa'}}>Custom</div>
                  <div style={{fontSize:'11px', color:'var(--text-muted)'}}>pricing</div>
                </div>
                <div className="plan-desc">Launch at scale with volume-based discounts.</div>
                <div className="plan-feature"><span className="label" style={{color:'var(--teal)'}}>✓</span><span>Agent Training from Recording</span></div>
                <div className="plan-feature"><span className="label" style={{color:'var(--teal)'}}>✓</span><span>Dedicated support</span></div>
                <Link to="/contact"><button className="btn btn-dark plan-btn">📞 Contact Us</button></Link>
              </div>
            </div>

            <div style={{textAlign:'center', marginBottom:'32px', marginTop:'60px'}}>
              <h2 style={{fontSize:'24px', fontWeight:800, marginBottom:'6px'}}>Features Compare</h2>
            </div>
            
            <div style={{overflowX:'auto', marginBottom:'60px'}} className="animate-me">
              <table className="feature-table" style={{minWidth:'700px'}}>
                <thead>
                  <tr>
                    <th>Features</th>
                    <th>Early deployers</th>
                    <th>Growth</th>
                    <th>Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dedicated support</td>
                    <td>Email</td>
                    <td>Email</td>
                    <td>Email / Whatsapp / Slack</td>
                  </tr>
                  <tr>
                    <td>Train assistant from call recording</td>
                    <td><span className="check-no">✕</span></td>
                    <td><span className="check-no">✕</span></td>
                    <td><span className="check-yes">✓</span></td>
                  </tr>
                  <tr>
                    <td>Import phone number</td>
                    <td><span className="check-yes">✓</span></td>
                    <td><span className="check-yes">✓</span></td>
                    <td><span className="check-yes">✓</span></td>
                  </tr>
                  <tr>
                    <td>API access</td>
                    <td></td>
                    <td></td>
                    <td><span className="check-yes">✓</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </>
  );
}
