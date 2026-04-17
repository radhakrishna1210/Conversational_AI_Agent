export default function Settings() {
  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your account settings and preferences
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px' }}>
        
        {/* Personal Information */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px 32px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>👤</span> Personal Information
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
            Update your name and phone number
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Name</label>
              <input type="text" className="form-input" defaultValue="claude pro" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Email</label>
              <input type="email" className="form-input" defaultValue="claude.pro.1222@gmail.com" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Phone</label>
              <input type="text" className="form-input" placeholder="Your phone number" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{
              background: 'var(--teal)',
              color: 'var(--bg-primary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Save changes
            </button>
          </div>
        </div>

        {/* Security */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px 32px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>🔒</span> Security
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
            Change your account password
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Current Password</label>
              <input type="password" className="form-input" placeholder="Enter current password" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>New Password</label>
              <input type="password" className="form-input" placeholder="Enter new password" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Confirm New Password</label>
              <input type="password" className="form-input" placeholder="Confirm new password" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{
              background: 'var(--teal)',
              color: 'var(--bg-primary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Change password
            </button>
          </div>
        </div>

        {/* Preferences */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px 32px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>🌐</span> Preferences
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
            Manage your timezone and display settings
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Timezone</label>
              <select className="form-select" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none', padding: '10px 14px' }}>
                <option>Los Angeles (GMT-7)</option>
                <option>New York (GMT-5)</option>
                <option>London (GMT+0)</option>
                <option>Tokyo (GMT+9)</option>
              </select>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0 0 0' }}>
                This will be used for displaying dates and times throughout the application.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{
              background: 'var(--teal)',
              color: 'var(--bg-primary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Save timezone
            </button>
          </div>
        </div>

      </div>

    </>
  );
}
