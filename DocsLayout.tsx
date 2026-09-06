import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { Search, Menu, X, BookOpen } from 'lucide-react';
import { isLoggedIn, isAdminRole } from '@/lib/authStorage';

const DOCS_MENU = [
  {
    group: 'User Documentation',
    items: [
      { title: 'Platform Overview', path: '/docs/user/overview', tags: 'introduction overview features modules design screenshots' },
      { title: 'Getting Started', path: '/docs/user/getting-started', tags: 'getting started registration onboarding dashboard steps' },
      { title: 'Voice AI Assistants', path: '/docs/user/voice-assistants', tags: 'agents prompt persona voice settings details boundaries tuning speed' },
      { title: 'Creating AI Voice Agents', path: '/docs/user/agents', tags: 'agents system prompt persona configuration voice provider behavior settings creation' },
      { title: 'Clone Voice', path: '/docs/user/clone-voice', tags: 'clone recording voice elevelabs dynamic setup' },
      { title: 'Knowledge Base', path: '/docs/user/knowledge-base', tags: 'grounding context pdf csv txt files vectors' },
      { title: 'Integrations', path: '/docs/user/integrations', tags: 'crm hubspot salesforce webhook api' },
      { title: 'Phone Numbers', path: '/docs/user/phone-numbers', tags: 'provisioning buy number twilio plivo line mapping' },
      { title: 'Call Contacts', path: '/docs/user/contacts', tags: 'leads spreadsheet csv columns attributes details list' },
      { title: 'Bulk Call Campaigns', path: '/docs/user/bulk-campaigns', tags: 'outbound dialer schedule progress metrics campaigns' },
      { title: 'Voice Broadcast', path: '/docs/user/voice-broadcast', tags: 'one-way announcement audio record player text to speech' },
      { title: 'Call Logs', path: '/docs/user/call-logs', tags: 'history details transcript recording sentiment duration billing' },
      { title: 'Calls & Log Management', path: '/docs/user/calls-logs', tags: 'calls logs list detail transcript waveform metrics management' },
      { title: 'Analytics', path: '/docs/user/analytics', tags: 'margin cost volumes performance graphs trends' },
      { title: 'WhatsApp', path: '/docs/user/whatsapp', tags: 'whatsapp QR code follow-up link device template chat' },
      { title: 'Workspace & Team Settings', path: '/docs/user/team', tags: 'team workspace members invite roles api keys settings' },
      { title: 'Billing & Wallet', path: '/docs/user/billing', tags: 'billing pricing wallet credit plan charges' },
      { title: 'API Keys', path: '/docs/user/api-keys', tags: 'developer tokens token integration access revoke' },
      { title: 'Troubleshooting', path: '/docs/user/troubleshooting', tags: 'troubleshoot help issues support guide fix connection' },
      { title: 'FAQ', path: '/docs/user/faq', tags: 'common questions quick answers limits languages' }
    ]
  },
  {
    group: 'Developer Documentation',
    items: [
      { title: '1. Overview', path: '/docs/developer/overview', tags: 'introduction overview architecture modules stack setup' },
      { title: '2. Architecture', path: '/docs/developer/architecture', tags: 'system lifecycle pipeline sequence mermaid data flow' },
      { title: '3. Backend', path: '/docs/developer/backend', tags: 'express node app routes controllers services middleware' },
      { title: '4. Database', path: '/docs/developer/database', tags: 'postgresql prisma schema models ER diagram wallet ledger' },
      { title: '5. Queues & Workers', path: '/docs/developer/queues-workers', tags: 'bullmq redis campaign worker threads scheduling' },
      { title: '6. WebSockets', path: '/docs/developer/websockets', tags: 'realtime media stream bridge pacer vad speechgate finalizer' },
      { title: '7. Frontend', path: '/docs/developer/frontend', tags: 'react vite client authFetch whapi sse routing' },
      { title: '8. Security', path: '/docs/developer/security', tags: 'jwt bcrypt auth api keys encryption audit log compliance' },
      { title: '9. Infrastructure', path: '/docs/developer/infrastructure', tags: 'nginx pm2 vps deployment ssl certbot pgbouncer' },
      { title: '10. Integrations', path: '/docs/developer/integrations', tags: 'telephony LLM TTS STT CRM matrix razorpay webhooks' },
      { title: '11. Development Workflow', path: '/docs/developer/dev-workflow', tags: 'setup env git branching testing endpoint provider PR' },
      { title: '12. System Troubleshooting', path: '/docs/developer/troubleshooting', tags: 'matrix errors fix connection build database ws 1006' },
      { title: '13. Codebase Reference', path: '/docs/developer/codebase-reference', tags: 'directories files services index summary' }
    ]
  }
];

export default function DocsLayout() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const showDevDocs = isLoggedIn() && isAdminRole();
  const visibleMenu = showDevDocs 
    ? DOCS_MENU 
    : DOCS_MENU.filter(group => group.group !== 'Developer Documentation');

  // Filter menu items based on search query
  const filteredMenu = visibleMenu.map(group => {
    const items = group.items.filter(item => {
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        item.tags.toLowerCase().includes(query)
      );
    });
    return { ...group, items };
  }).filter(group => group.items.length > 0);

  return (
    <div className="docs-portal-wrapper" style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      position: 'relative'
    }}>
      
      {/* Mobile Top Header (only visible on mobile/tablet) */}
      <div className="docs-mobile-header" style={{
        display: 'none',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%'
      }}>
        <Link to="/docs" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>
          <BookOpen size={20} style={{ color: 'var(--teal)' }} />
          <span>Spandan Docs</span>
        </Link>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: 4
          }}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside 
        className={`docs-sidebar ${mobileMenuOpen ? 'open' : ''}`} 
        style={{
          width: 280,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          overflowY: 'auto'
        }}
      >
        {/* Brand Home Link (Desktop only) */}
        <div className="docs-sidebar-brand" style={{ marginBottom: 24 }}>
          <Link to="/docs" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 700, fontSize: 18 }}>
            <BookOpen size={22} style={{ color: 'var(--teal)' }} />
            <span>Spandan Docs</span>
          </Link>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 12px 8px 36px',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none'
            }}
          />
        </div>

        {/* Navigation List */}
        <nav style={{ flex: 1 }}>
          {filteredMenu.length === 0 ? (
            <div style={{ padding: '0 8px', color: 'var(--text-muted)', fontSize: 13 }}>
              No articles match your search
            </div>
          ) : (
            filteredMenu.map(group => (
              <div key={group.group} style={{ marginBottom: 24 }}>
                <h4 style={{
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                  paddingLeft: 8,
                  fontWeight: 600
                }}>
                  {group.group}
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {group.items.map(item => (
                    <li key={item.path} style={{ marginBottom: 4 }}>
                      <NavLink
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: 6,
                          color: isActive ? 'var(--teal-fg)' : 'var(--text-secondary)',
                          background: isActive ? 'var(--bg-hover)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: 14,
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all 0.15s ease'
                        })}
                      >
                        {item.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        padding: '40px 48px',
        maxWidth: 960,
        margin: '0 auto',
        overflowY: 'auto'
      }} className="docs-main-content">
        <Outlet />
      </main>

      {/* Add Responsive Style Tag to head */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .docs-portal-wrapper {
            flex-direction: column;
          }
          .docs-mobile-header {
            display: flex !important;
          }
          .docs-sidebar {
            position: fixed !important;
            top: 49px !important;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100% !important;
            height: calc(100vh - 49px) !important;
            transform: translateX(-100%);
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            background: var(--bg-secondary) !important;
          }
          .docs-sidebar.open {
            transform: translateX(0);
          }
          .docs-sidebar-brand {
            display: none !important;
          }
          .docs-main-content {
            padding: 24px 16px !important;
          }
        }
      `}} />
    </div>
  );
}
