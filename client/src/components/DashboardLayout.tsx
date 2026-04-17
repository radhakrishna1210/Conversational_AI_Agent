import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [showBanner, setShowBanner] = useState(true);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [user, setUser] = useState({ name: 'User', email: '', initials: 'U' });
  
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const handleLogout = () => {
    sessionStorage.setItem('loggedOut', '1');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('workspaceId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    navigate('/login');
  };

  useEffect(() => {
    const name = localStorage.getItem('userName');
    const email = localStorage.getItem('userEmail');
    
    let displayName = name || 'User';
    let displayEmail = email || '';
    
    // If not in localStorage, try decoding the token
    if (!name || !email) {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          displayName = payload.name || payload.email?.split('@')[0] || 'User';
          displayEmail = payload.email || '';
        } catch (e) {}
      }
    }

    const initials = displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2) || 'U';

    setUser({ name: displayName, email: displayEmail, initials });
  }, []);

  return (
    <div className="dashboard-layout">
      {/* Topbar */}
      <div style={{background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)', position: 'fixed', top: 0, left: '68px', right: 0, zIndex: 10, height: '56px'}}>
        <div className="dashboard-topbar">
          <div className="topbar-search">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Search or jump to..." />
            <span style={{fontSize:'11px', border:'1px solid var(--border)', borderRadius:'4px', padding:'1px 6px', color:'var(--text-muted)'}}>⌘ K</span>
          </div>
          <div className="topbar-actions">
            <button style={{background:'none', border:'none', color:'var(--text-secondary)', fontSize:'20px', cursor:'pointer', position:'relative'}}>
              🔔
              <span style={{position:'absolute', top:'-2px', right:'-2px', width:'8px', height:'8px', background:'var(--orange)', borderRadius:'50%', display:'block'}}></span>
            </button>
            <div style={{ position: 'relative' }}>
              <div 
                className="topbar-avatar" 
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                style={{ cursor: 'pointer', background: '#00b4d8', color: '#001a2c', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {user.initials}
              </div>
              
              {profileDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '10px',
                  width: '240px',
                  background: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 50,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid #2a2a2a' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#fff', marginBottom: '4px', textTransform: 'uppercase' }}>{user.name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>{user.email}</div>
                  </div>
                  
                  <div style={{ padding: '8px 0', borderBottom: '1px solid #2a2a2a' }}>
                    <Link to="/profile" style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', textDecoration: 'none', color: '#eaeaea', fontSize: '14px', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#1f1f1f'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      Profile
                    </Link>
                    <Link to="/settings" style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', textDecoration: 'none', color: '#eaeaea', fontSize: '14px', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#1f1f1f'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                      Settings
                    </Link>
                    <Link to="/billing" style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', textDecoration: 'none', color: '#eaeaea', fontSize: '14px', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#1f1f1f'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                      Billing
                    </Link>
                  </div>
                  
                  <div style={{ padding: '8px 0' }}>
                    <div 
                      onClick={handleLogout}
                      style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', color: '#eaeaea', fontSize: '14px', transition: 'background 0.2s' }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#1f1f1f'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                      Log out
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button style={{background:'none', border:'none', color:'var(--text-secondary)', fontSize:'18px', cursor:'pointer'}}>🌙</button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="sidebar">
        <Link to="/" style={{textDecoration: 'none'}}>
          <div className="sidebar-header">
            <div className="sidebar-logo-icon">O</div>
            <div className="sidebar-logo-text">OMNI<span style={{color: 'white', fontWeight: 300}}>DIMENSION</span></div>
          </div>
        </Link>

        <div className="sidebar-content-scroll">
          <div className="sidebar-section">
            <div className="sidebar-category">VOICE AI SETUP</div>
            <Link to="/dashboard" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/dashboard' ? 'active' : ''}`}>
                <span className="sidebar-icon">🤖</span>
                <span className="sidebar-text">Voice AI Assistants</span>
              </div>
            </Link>
            <Link to="/clone_voice" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/clone_voice' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>🎙️</span>
                <span className="sidebar-text">Clone Voice</span>
                <span className="badge-new">New</span>
              </div>
            </Link>
            <Link to="/files" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/files' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>🗂️</span>
                <span className="sidebar-text">Files</span>
              </div>
            </Link>
            <Link to="/integrations" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/integrations' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>🔌</span>
                <span className="sidebar-text">Integrations</span>
              </div>
            </Link>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">OPERATIONS & MONITORING</div>
            <Link to="/phone_numbers" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/phone_numbers' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>☎️</span>
                <span className="sidebar-text">Phone Numbers</span>
              </div>
            </Link>
            <Link to="/bulk_call" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/bulk_call' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>📞</span>
                <span className="sidebar-text">Bulk Call</span>
              </div>
            </Link>
            <Link to="/call_logs" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/call_logs' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>📋</span>
                <span className="sidebar-text">Call Logs</span>
              </div>
            </Link>
            <Link to="/analytics" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/analytics' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>📊</span>
                <span className="sidebar-text">Analytics</span>
              </div>
            </Link>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">CHAT</div>
            <Link to="/whatsapp" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/whatsapp' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>💬</span>
                <span className="sidebar-text">WhatsApp</span>
              </div>
            </Link>
            <a
              href="#"
              style={{textDecoration: 'none'}}
              onClick={e => {
                e.preventDefault();
                const base = import.meta.env.VITE_WHABRIDGE_URL ?? '/WhaBridge';
                const token = localStorage.getItem('token') ?? '';
                const workspaceId = localStorage.getItem('workspaceId') ?? '';
                const refreshToken = localStorage.getItem('refreshToken') ?? '';
                const url = new URL(base, window.location.origin);
                url.searchParams.set('token', token);
                url.searchParams.set('workspaceId', workspaceId);
                if (refreshToken) url.searchParams.set('refreshToken', refreshToken);
                window.location.href = url.toString();
              }}
            >
              <div className="sidebar-item">
                <span className="sidebar-icon" style={{fontSize: '15px'}}>🟢</span>
                <span className="sidebar-text">WhaBridge</span>
              </div>
            </a>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">ACCOUNT & BILLING</div>
            <Link to="/billing" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/billing' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>💳</span>
                <span className="sidebar-text">Billing</span>
              </div>
            </Link>
            <Link to="/api_keys" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/api_keys' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>🔑</span>
                <span className="sidebar-text">API</span>
              </div>
            </Link>
          </div>
        </div>

        <div className="sidebar-spacer"></div>

        <div className="sidebar-bottom">
          <Link to="/settings" style={{textDecoration: 'none'}}>
            <div className={`sidebar-item ${path === '/settings' ? 'active' : ''}`}>
              <span className="sidebar-icon">⚙️</span>
              <span className="sidebar-text">Settings</span>
            </div>
          </Link>
          <div
            className="sidebar-item"
            onClick={handleLogout}
            style={{ cursor: 'pointer' }}
          >
            <span className="sidebar-icon">↩️</span>
            <span className="sidebar-text">Logout</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main" style={{ marginTop: '56px', marginLeft: '64px' }}>
        {showBanner && (
          <div className="announcement-dash">
            <span>✨ Get your own phone number and attach your assistant now!</span>
            <button className="btn btn-orange btn-sm">Buy Phone Number →</button>
            <button style={{background:'none', border:'none', color:'rgba(255,255,255,0.7)', fontSize:'18px', cursor:'pointer', marginLeft:'8px'}} onClick={() => setShowBanner(false)}>✕</button>
          </div>
        )}
        <div className="dashboard-content">
          {children}
        </div>
      </main>
    </div>
  );
}
