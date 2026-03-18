import DashboardLayout from '../components/DashboardLayout';

export default function WhatsApp() {
  return (
    <DashboardLayout>
      <div style={{ marginBottom: '64px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>WhatsApp</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your WhatsApp Business connections and settings.
        </p>
      </div>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Connect WhatsApp</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '40px' }}>
          Get started by connecting your WhatsApp Business account.
        </p>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '24px',
          width: '100%'
        }}>
          
          {/* Phone WhatsApp Card */}
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.01)',
            padding: '40px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s, transform 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px'
            }}>
              <svg width="28" height="28" fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'white' }}>Phone WhatsApp</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
              Connect using your existing phone number via QR code scan
            </p>
          </div>

          {/* Cloud WhatsApp Card */}
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.01)',
            padding: '40px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s, transform 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px'
            }}>
              <svg width="28" height="28" fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'white' }}>Cloud WhatsApp</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
              Connect via Meta Cloud API for high-volume enterprise messaging
            </p>
          </div>

        </div>

      </div>
    </DashboardLayout>
  );
}
