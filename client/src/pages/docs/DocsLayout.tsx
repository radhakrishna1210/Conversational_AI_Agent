import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Search, Menu, X, BookOpen, ChevronRight } from 'lucide-react';

const DOCS_MENU = [
  {
    group: 'Getting Started',
    items: [
      { title: 'Platform Overview', path: '/docs/user/overview', tags: 'introduction overview features architecture modules lifecycle' },
      { title: 'Quick Start Guide', path: '/docs/user/getting-started', tags: 'getting started registration onboarding dashboard first call steps' }
    ]
  },
  {
    group: 'Voice AI Setup',
    items: [
      { title: 'Voice AI Assistants', path: '/docs/user/voice-assistants', tags: 'assistants architecture pipeline speechgate vad engine' },
      { title: 'Creating & Editing Agents', path: '/docs/user/agents', tags: 'agents system prompt persona workbench tabs model voice transcription postcall' },
      { title: 'Voice Cloning Studio', path: '/docs/user/clone-voice', tags: 'clone recording voice studio sample synthesis elevenlabs' },
      { title: 'Knowledge Base Grounding', path: '/docs/user/knowledge-base', tags: 'grounding context pdf csv txt files rag pgvector embeddings' }
    ]
  },
  {
    group: 'Audience & Telephony',
    items: [
      { title: 'Phone Numbers & DLT', path: '/docs/user/phone-numbers', tags: 'telephony phone numbers verified caller id trai dlt compliance pe tm headers' },
      { title: 'Contacts & Clusters', path: '/docs/user/contacts', tags: 'leads address book contacts clusters csv import deduplication e164 opt out' }
    ]
  },
  {
    group: 'Outbound Operations',
    items: [
      { title: 'Bulk Call Campaigns', path: '/docs/user/bulk-campaigns', tags: 'outbound dialer schedule progress metrics campaigns concurrency pause resume' },
      { title: 'Voice Broadcast', path: '/docs/user/voice-broadcast', tags: 'one-way announcement audio record player text to speech studio answered billing' }
    ]
  },
  {
    group: 'Monitoring & Insights',
    items: [
      { title: 'Call Logs & Waveforms', path: '/docs/user/call-logs', tags: 'history details transcript recording waveform duration billing export csv' },
      { title: 'Conversation Analysis', path: '/docs/user/calls-logs', tags: 'transcripts sentiment analysis variables extracted json entities' },
      { title: 'Analytics & Costs', path: '/docs/user/analytics', tags: 'margin cost volumes performance graphs trends kpi duration' }
    ]
  },
  {
    group: 'Channels & Integrations',
    items: [
      { title: 'WhatsApp Omnichannel', path: '/docs/user/whatsapp', tags: 'whatsapp QR code cloud api meta follow-up link device template chat' },
      { title: 'Integrations Ecosystem', path: '/docs/user/integrations', tags: 'crm hubspot salesforce cal.com calendly zapier make n8n custom api webhook' }
    ]
  },
  {
    group: 'Workspace & Billing',
    items: [
      { title: 'Workspace & Team', path: '/docs/user/team', tags: 'team workspace members invite roles permissions settings business hours notifications' },
      { title: 'Billing & Prepaid Wallet', path: '/docs/user/billing', tags: 'billing pricing wallet inr razorpay topup credit ledger invoices gst' },
      { title: 'API Keys', path: '/docs/user/api-keys', tags: 'developer tokens rest api authentication live test rotate revoke' }
    ]
  },
  {
    group: 'Help & Reference',
    items: [
      { title: 'Troubleshooting Guide', path: '/docs/user/troubleshooting', tags: 'troubleshoot help issues support guide fix connection errors validation' },
      { title: 'FAQ & Glossary', path: '/docs/user/faq', tags: 'common questions quick answers terminology glossary limits languages vad rag' }
    ]
  }
];

export default function DocsLayout() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const visibleMenu = DOCS_MENU;

  // Automatically expand the category that contains the active page
  useEffect(() => {
    const activeGroup = visibleMenu.find(group => 
      group.items.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
    );
    if (activeGroup) {
      setExpandedGroups(prev => ({
        ...prev,
        [activeGroup.group]: true
      }));
    }
  }, [location.pathname]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

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
      
      {/* Mobile Top Header */}
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
          aria-label="Toggle mobile navigation"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside 
        className={`docs-sidebar ${mobileMenuOpen ? 'open' : ''}`} 
        style={{
          width: 290,
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
        <div className="docs-sidebar-brand" style={{ marginBottom: 20 }}>
          <Link to="/docs" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 700, fontSize: 18 }}>
            <BookOpen size={22} style={{ color: 'var(--teal)' }} />
            <span>Spandan Docs</span>
          </Link>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search documentation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 12px 8px 36px',
              color: 'var(--text-primary)',
              fontSize: 13.5,
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Collapsible Navigation List */}
        <nav style={{ flex: 1 }}>
          {filteredMenu.length === 0 ? (
            <div style={{ padding: '0 8px', color: 'var(--text-muted)', fontSize: 13 }}>
              No articles match your search
            </div>
          ) : (
            filteredMenu.map(group => {
              const isSearching = searchQuery.trim().length > 0;
              const isExpanded = isSearching || !!expandedGroups[group.group];
              const hasActiveChild = group.items.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'));

              return (
                <div key={group.group} style={{ marginBottom: 6 }}>
                  {/* Category Header Button */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="docs-sidebar-category-btn"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: hasActiveChild ? 'var(--teal-fg)' : 'var(--text-primary)',
                      fontSize: 13.5,
                      fontWeight: 600,
                      textAlign: 'left',
                      transition: 'background 0.15s ease, color 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ChevronRight
                        size={15}
                        style={{
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                          color: isExpanded || hasActiveChild ? 'var(--teal)' : 'var(--text-muted)',
                          flexShrink: 0
                        }}
                      />
                      <span>{group.group}</span>
                    </div>
                  </button>

                  {/* Collapsible Page Links */}
                  <div className={`docs-collapsible-content ${isExpanded ? 'expanded' : ''}`}>
                    <div className="docs-collapsible-inner" style={{
                      paddingLeft: 12,
                      marginLeft: 17,
                      borderLeft: '1px solid var(--border)',
                      marginTop: 2,
                      marginBottom: 6
                    }}>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {group.items.map(item => (
                          <li key={item.path} style={{ marginBottom: 2 }}>
                            <NavLink
                              to={item.path}
                              onClick={() => setMobileMenuOpen(false)}
                              style={({ isActive }) => ({
                                display: 'flex',
                                alignItems: 'center',
                                padding: '5px 10px',
                                borderRadius: 6,
                                color: isActive ? 'var(--teal-fg)' : 'var(--text-secondary)',
                                background: isActive ? 'var(--bg-hover)' : 'transparent',
                                textDecoration: 'none',
                                fontSize: 13,
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
                  </div>
                </div>
              );
            })
          )}
        </nav>
      </aside>

      {/* Main Documentation Area */}
      <main className="docs-main-content" style={{
        flex: 1,
        padding: '40px clamp(20px, 4vw, 56px)',
        overflowY: 'auto',
        maxWidth: 1000
      }}>
        <Outlet />
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .docs-collapsible-content {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 200ms ease, opacity 200ms ease;
          opacity: 0;
          overflow: hidden;
        }
        .docs-collapsible-content.expanded {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        .docs-collapsible-inner {
          min-height: 0;
          overflow: hidden;
        }
        .docs-sidebar-category-btn:hover {
          background: var(--bg-hover) !important;
        }
        @media (max-width: 900px) {
          .docs-mobile-header {
            display: flex !important;
          }
          .docs-sidebar {
            position: fixed !important;
            left: -290px;
            top: 0;
            bottom: 0;
            transition: left 0.2s ease-in-out;
          }
          .docs-sidebar.open {
            left: 0 !important;
          }
          .docs-sidebar-brand {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
