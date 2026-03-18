export default function PhoneNumbers() {
  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Phone Numbers</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your phone numbers and attached bots
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* Buy a Phone Number Card */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.02)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', margin: 0 }}>
              <span style={{ color: 'var(--teal)' }}>📞</span> Buy a Phone Number
            </h3>
            <span style={{
              background: 'rgba(220, 100, 0, 0.2)',
              color: '#fb923c',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700
            }}>
              New
            </span>
          </div>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
            Instantly get a phone number for calling, campaigns, and connecting with your customers.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px', flexGrow: 1 }}>
            
            <div style={{
              border: '1px solid rgba(0, 212, 200, 0.3)',
              borderRadius: '6px',
              padding: '16px',
              background: 'rgba(0, 212, 200, 0.05)'
            }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '8px', color: 'white' }}>
                <span style={{ color: 'var(--teal)' }}>🤖</span> Connect Agents & Campaigns
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                Assign phone numbers to your AI agents for seamless voice interactions and scale your outreach with outbound campaigns.
              </p>
            </div>

            <div style={{
              border: '1px solid rgba(251, 146, 60, 0.3)',
              borderRadius: '6px',
              padding: '16px',
              background: 'rgba(251, 146, 60, 0.05)'
            }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '8px', color: 'white' }}>
                <span style={{ color: '#fb923c' }}>🌐</span> Global Coverage
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                We offer both Indian <strong style={{ color: '#10b981' }}>(+91)</strong> and US <strong style={{ color: '#10b981' }}>(+1)</strong> numbers. Check out our inventory!
              </p>
            </div>

          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '14px' }}>
            Buy Number Now <span style={{ marginLeft: '4px' }}>→</span>
          </button>
        </div>

        {/* Import Existing Number Card */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.02)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', marginBottom: '16px', margin: 0 }}>
            <span style={{ color: 'var(--text-secondary)' }}>📥</span> Import Existing Number
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
            Already have a provider? Bring your own numbers to our platform seamlessly.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>📞</span> Import from Twilio
            </button>

            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>📞</span> Import from Exotel
            </button>

            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>📞</span> Import from SIP Trunk
            </button>

          </div>
        </div>

      </div>

      {/* Empty State Card */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        padding: '60px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        background: 'rgba(255,255,255,0.02)' 
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '36px', opacity: 0.8 }}>
          📞
        </div>
        <h3 style={{ fontSize: '18px', marginBottom: '8px', fontWeight: 600 }}>No phone numbers yet</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Purchase your first phone number to get started
        </p>
      </div>

    </>
  );
}
