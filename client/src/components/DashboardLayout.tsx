import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import WHSidebar from './WHSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [showBanner, setShowBanner] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  
  const isWHPage = path === '/wh' || path.startsWith('/wh/');

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
            <div className="topbar-avatar">O</div>
            <button style={{background:'none', border:'none', color:'var(--text-secondary)', fontSize:'18px', cursor:'pointer'}}>🌙</button>
          </div>
        </div>
      </div>

      {/* Expandable Sidebar */}
      <aside className={`sidebar ${isWHPage ? 'sidebar-locked' : ''}`} style={isWHPage ? { pointerEvents: 'none' } : {}}>
        <Link to="/" style={{textDecoration: 'none', pointerEvents: isWHPage ? 'auto' : 'auto'}}>
          <div className="sidebar-header">
            <div className="sidebar-logo-icon">O</div>
            <div className="sidebar-logo-text">OMNI<span style={{color: 'white', fontWeight: 300}}>DIMENSION</span></div>
          </div>
        </Link>

        {/* Re-enable pointer events for inner content to allow clicking active icons even if locked */}
        <div className="sidebar-content-scroll" style={isWHPage ? { pointerEvents: 'auto' } : {}}>
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
            <Link to="/wh" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/wh' ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{fontSize: '15px'}}>📝</span>
                <span className="sidebar-text">WH</span>
              </div>
            </Link>
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

        <div className="sidebar-bottom" style={isWHPage ? { pointerEvents: 'auto' } : {}}>
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

      {isWHPage && <WHSidebar />}

      {/* Main Content Area */}
      <main className="dashboard-main" style={{ marginTop: '56px', marginLeft: isWHPage ? '136px' : '64px', transition: 'margin-left 0.3s' }}>
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
