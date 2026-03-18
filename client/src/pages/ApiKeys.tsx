import DashboardLayout from '../components/DashboardLayout';

export default function ApiKeys() {
  return (
    <DashboardLayout>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>API Access</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your API keys and integrate with OmniDimension
        </p>
      </div>

      {/* API Keys Card */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '12px', 
        background: 'rgba(255,255,255,0.02)',
        padding: '24px 32px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', color: 'white' }}>
              <span style={{ color: 'var(--teal)' }}>🔑</span> API Keys
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              Create and manage API keys for different integrations
            </p>
          </div>
          <button style={{
            background: 'var(--teal)',
            color: 'var(--bg-primary)',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Add New Key
          </button>
        </div>

        {/* API Keys Table */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(300px, 2fr) minmax(100px, 1fr) 80px', gap: '16px', alignItems: 'center' }}>
          
          {/* Header Row */}
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px' }}>Name</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px' }}>API Key</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px' }}>Created</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px', textAlign: 'center' }}>Actions</div>

          {/* Data Row */}
          <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>OmniDimension API Key</div>
          
          {/* API Key Input Container */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type="password" 
              value="••••••••••••••••••••••••••••••••••••••" 
              readOnly 
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '10px 80px 10px 16px',
                color: 'white',
                fontSize: '16px',
                letterSpacing: '2px',
                outline: 'none'
              }}
            />
            <div style={{ position: 'absolute', right: '12px', display: 'flex', gap: '12px', color: 'var(--text-muted)' }}>
              <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>👁️</button>
              <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>📋</button>
            </div>
          </div>
          
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>2 days ago</div>
          
          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: 'none',
              color: '#ef4444',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            >
              🗑️
            </button>
          </div>

        </div>
      </div>

      {/* API Documentation Card */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '12px', 
        background: 'rgba(255,255,255,0.02)',
        padding: '32px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
          API Documentation
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
          Learn how to integrate with our API
        </p>

        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
          Our API allows you to programmatically create and manage voice AI agents, access call logs, and more.
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--teal)',
            color: 'var(--teal)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Visit Docs
          </button>
          <button style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--teal)',
            color: 'var(--teal)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Visit SDK on Github
          </button>
        </div>
      </div>

    </DashboardLayout>
  );
}
