import { Link, useLocation } from 'react-router-dom';

type NavItem = { label: string; path: string; icon: React.ReactNode; exact?: boolean };
type NavGroup = { group: string | null; items: NavItem[] };

const navItems: NavGroup[] = [
  {
    group: null,
    items: [
      { label: 'Home', path: '/WhaBridge', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      ), exact: true },
    ]
  },
  {
    group: 'CORE MODULES',
    items: [
      { label: 'Number Setup', path: '/WhaBridge/number-setup', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      )},
      { label: 'API Management', path: '/WhaBridge/api', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
      )},
      { label: 'Templates', path: '/WhaBridge/templates', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      )},
      { label: 'Campaigns', path: '/WhaBridge/campaigns', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>
      )},
      { label: 'Contacts', path: '/WhaBridge/contacts', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      )},
    ]
  },
  {
    group: 'ENGAGEMENT',
    items: [
      { label: 'Live Inbox', path: '/WhaBridge/inbox', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      )},
      { label: 'Automation', path: '/WhaBridge/automation', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01"/></svg>
      )},
    ]
  },
  {
    group: 'INSIGHTS',
    items: [
      { label: 'Analytics', path: '/WhaBridge/analytics', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      )},
      { label: 'Settings', path: '/WhaBridge/settings', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      )},
    ]
  }
];

export default function WHSidebar() {
  const location = useLocation();
  const path = location.pathname;

  const isActive = (itemPath: string, exact?: boolean) => {
    if (exact) return path === itemPath;
    return path === itemPath || path.startsWith(itemPath + '/');
  };

  return (
    <aside className="wh-sidebar" style={{
      backgroundColor: '#fff',
      borderRight: '1px solid #e2e8f0',
      position: 'fixed',
      top: '56px',
      bottom: 0,
      left: '68px',
      zIndex: 90,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      color: '#334155'
    }}>
      {/* Scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {navItems.map((group, gi) => (
          <div key={gi}>
            {group.group && (
              <div className="wh-sidebar-category" style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: gi > 0 ? '8px' : '0' }}>
                {group.group}
              </div>
            )}
            {group.items.map((item, ii) => {
              const active = isActive(item.path, item.exact);
              return (
                <Link key={ii} to={item.path} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    backgroundColor: active ? '#1e4034' : 'transparent',
                    color: active ? '#fff' : '#334155',
                    borderLeft: active ? '3px solid #10b981' : '3px solid transparent',
                    transition: 'background-color 0.15s',
                    height: '42px',
                  }}
                    onMouseOver={e => { if (!active) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                    onMouseOut={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div className="wh-sidebar-icon">
                      {item.icon}
                    </div>
                    <span className="wh-sidebar-text" style={{ fontSize: '14px', fontWeight: active ? 700 : 500, paddingRight: '16px' }}>
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Logout */}
      <div style={{ padding: '8px 12px' }}>
        <button
          onClick={() => {
            sessionStorage.setItem('loggedOut', '1');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('workspaceId');
            localStorage.removeItem('userName');
            localStorage.removeItem('userEmail');
            window.location.replace('/login');
          }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#64748b', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fecaca'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span className="wh-sidebar-text">Logout</span>
        </button>
      </div>

      {/* Footer tour card */}
      <div style={{ padding: '12px 16px' }}>
        <div className="wh-sidebar-tour" style={{ backgroundColor: '#062828', borderRadius: '8px', padding: '14px', color: '#fff' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <span style={{ fontSize: '16px' }}>🎓</span> Need a Quick Tour?
          </div>
          <button style={{ backgroundColor: '#e2e8f0', color: '#000', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Start Tour</button>
        </div>
      </div>
    </aside>
  );
}
