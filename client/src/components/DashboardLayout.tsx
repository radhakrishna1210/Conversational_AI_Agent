import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [showBanner, setShowBanner] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  return (
    <div className="dashboard-layout">
      {/* Topbar */}
      <div style={{background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)', position: 'fixed', top: 0, left: '68px', right: 0, zIndex: 10, height: '56px'}}>
        <div className="dashboard-topbar">
          <div className="topbar-search">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Search or jump to..." />
            <span>⌘ K</span>
          </div>
          <div className="topbar-actions">
            {/* Bell with red badge */}
            <button style={{background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', position:'relative', display:'flex', alignItems:'center', justifyContent:'center', padding:'4px'}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span style={{position:'absolute', top:'2px', right:'2px', width:'8px', height:'8px', background:'#ef4444', borderRadius:'50%', display:'block', border:'1.5px solid var(--bg-secondary)'}}></span>
            </button>
            {/* GD Avatar */}
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #0a5446 0%, #0eb39e 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: '700', color: 'white',
              cursor: 'pointer', letterSpacing: '0.5px',
              border: '1.5px solid rgba(14,179,158,0.4)'
            }}>GD</div>
            {/* Moon / dark mode */}
            <button style={{background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:'4px'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </button>
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
            onClick={() => navigate('/')}
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
