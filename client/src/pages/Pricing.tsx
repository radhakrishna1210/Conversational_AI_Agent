import { useState } from 'react';
import { Link } from 'react-router-dom';
import AnnouncementBar from '../components/AnnouncementBar';

export default function Pricing() {
  const [activeTab, setActiveTab] = useState('Plans');

  return (
    <>
      <AnnouncementBar />
      
      <div className="page-hero">
        <div className="container">
          <h1 style={{color:'var(--teal)'}}>Pricing</h1>
          <p>Choose the perfect plan for your business. Start free, scale as you grow, and only pay for what you use.</p>
          <div style={{display:'flex', alignItems:'center', gap:'20px', justifyContent:'center', marginTop:'16px', fontSize:'13px', color:'var(--text-secondary)'}}>
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
              {/* Early Deployers (Featured) */}
              <div className="plan-card featured">
                <div className="plan-badge">9% OFF</div>
                <div className="plan-name" style={{color:'var(--teal)'}}>Early deployers</div>
                <div className="plan-price">
                  <span className="price-old">$10</span>
                  <span className="price-amount">$36</span>
                  <span className="price-period">/month</span>
                </div>
                <div className="plan-desc">Best for users doing a POC with a live voice AI agent.</div>
                <div className="plan-feature"><span className="label">Cost</span><span className="value">$0.085/min</span></div>
                <div className="plan-feature"><span className="label">Minutes</span><span className="value">~471 minutes</span></div>
                <div className="plan-feature"><span className="label">Knowledge base</span><span className="value">50 MB</span></div>
                <button className="btn btn-primary plan-btn">Upgrade</button>
              </div>

              {/* Growth */}
              <div className="plan-card">
                <div className="plan-name">Growth</div>
                <div className="plan-price">
                  <span className="price-amount">$200</span>
                  <span className="price-period">/month</span>
                </div>
                <div className="plan-desc">Best for users scaling post-POC voice AI usage.</div>
                <div className="plan-feature"><span className="label">Cost</span><span className="value">$0.070/min</span></div>
                <div className="plan-feature"><span className="label">Minutes</span><span className="value">~2857 minutes</span></div>
                <div className="plan-feature"><span className="label">Knowledge base</span><span className="value">100 MB</span></div>
                <button className="btn btn-secondary plan-btn">Upgrade</button>
              </div>

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
