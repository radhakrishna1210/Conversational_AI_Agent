import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  Mic,
  Folder,
  Plug,
  Phone,
  PhoneCall,
  FileText,
  BarChart3,
  MessageCircle,
  BookOpen,
  Mail,
  Bug,
  CreditCard,
  Key,
  Settings,
  LogOut,
  Search,
  Shield
} from "lucide-react";
import { useTheme } from '../hooks/useTheme';
import { CommandMenu } from './CommandMenu';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { getStorageItem, setStorageItem } from '../lib/storage';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { darkMode, toggleDarkMode } = useTheme();
  const [user, setUser] = useState({ name: 'User', email: '', initials: 'U', plan: '', role: '' });

  const profileRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const [isCommandMenuOpen, setIsCommandMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandMenuOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const sidebar = document.getElementById('layout-sidebar');
      const hamburger = document.getElementById('hamburger-btn');
      if (
        sidebarOpen &&
        sidebar &&
        hamburger &&
        !sidebar.contains(e.target as Node) &&
        !hamburger.contains(e.target as Node)
      ) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sidebarOpen]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    sessionStorage.setItem('loggedOut', '1');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('workspaceId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    navigate('/login');
  };

  useEffect(() => {
    const buildUser = (name: string, email: string, plan = '', role = '') => {
      const initials = name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2) || 'U';
      setUser({ name, email, initials, plan, role });
      setStorageItem('userName', name);
      setStorageItem('userEmail', email);
      if (role) setStorageItem('userRole', role);
    };

    const fetchMe = async () => {
      const token = getStorageItem('token');
      if (!token) return;
      try {
        const res = await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          const name = u.name || u.email?.split('@')[0] || 'User';

          // Extract role from JWT token payload since /auth/me doesn't return it directly
          let role = u.role || '';
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (!role && payload.role) role = payload.role;
          } catch (_) {}

          buildUser(name, u.email || '', u.plan || '', role);

          if (u.workspaceId && !getStorageItem('workspaceId')) {
            setStorageItem('workspaceId', u.workspaceId);
          }
          return;
        }
      } catch (_) {}

      // Fallback: decode JWT directly
      const token2 = getStorageItem('token');
      if (token2) {
        try {
          const payload = JSON.parse(atob(token2.split('.')[1]));
          const name = payload.name || payload.email?.split('@')[0] || 'User';
          buildUser(name, payload.email || '', payload.plan || '', payload.role || '');
          if (payload.workspaceId && !getStorageItem('workspaceId')) {
            setStorageItem('workspaceId', payload.workspaceId);
          }
          return;
        } catch (_) {}
      }

      const cachedName = getStorageItem('userName') || 'User';
      const cachedEmail = getStorageItem('userEmail') || '';
      const cachedRole = getStorageItem('userRole') || '';
      buildUser(cachedName, cachedEmail, '', cachedRole);
    };

    fetchMe();
  }, []);

  useEffect(() => {
    const token = getStorageItem('token');
    const workspaceId = getStorageItem('workspaceId');
    if (!token || !workspaceId) return;

    fetch(`/api/v1/workspaces/${workspaceId}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.count != null) setUnreadCount(data.count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="dashboard-layout">
      {/* ── Mobile sidebar overlay (mobile only) ── */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside id="layout-sidebar" className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <Link to="/" style={{textDecoration: 'none'}}>
          <div className="sidebar-header">
            <div className="sidebar-logo-icon">O</div>
            <div className="sidebar-logo-text">OMNI<span style={{color: 'white', fontWeight: 300}}>DIMENSION</span></div>
          </div>
        </Link>

        <div className="sidebar-content-scroll">
          <div className="sidebar-section">
            <div className="sidebar-category">VOICE AI SETUP</div>

            <Link to="/dashboard">
              <div className={`sidebar-item ${path === '/dashboard' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Bot size={16} /></span>
                <span className="sidebar-text">Voice AI Assistants</span>
              </div>
            </Link>
            <Link to="/voice_assistant" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/voice_assistant' ? 'active' : ''}`}>
                <span className="sidebar-icon">🔊</span>
                <span className="sidebar-text">Real-time TTS</span>
                <span className="badge-new">Live</span>
              </div>
            </Link>
            <Link to="/clone_voice" style={{textDecoration: 'none'}}>
              <div className={`sidebar-item ${path === '/clone_voice' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Mic size={16} /></span>
                <span className="sidebar-text">Clone Voice</span>
                <span className="badge-new">New</span>
              </div>
            </Link>

            <Link to="/files">
              <div className={`sidebar-item ${path === '/files' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Folder size={16} /></span>
                <span className="sidebar-text">Files</span>
              </div>
            </Link>

            <Link to="/integrations">
              <div className={`sidebar-item ${path === '/integrations' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Plug size={16} /></span>
                <span className="sidebar-text">Integrations</span>
              </div>
            </Link>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">OPERATIONS & MONITORING</div>

            <Link to="/phone_numbers">
              <div className={`sidebar-item ${path === '/phone_numbers' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Phone size={16} /></span>
                <span className="sidebar-text">Phone Numbers</span>
              </div>
            </Link>

            <Link to="/bulk_call/create">
              <div className={`sidebar-item ${path === '/bulk_call' || path === '/bulk_call/create' ? 'active' : ''}`}>
                <span className="sidebar-icon"><PhoneCall size={16} /></span>
                <span className="sidebar-text">Bulk Call</span>
              </div>
            </Link>

            <Link to="/call_logs">
              <div className={`sidebar-item ${path === '/call_logs' ? 'active' : ''}`}>
                <span className="sidebar-icon"><FileText size={16} /></span>
                <span className="sidebar-text">Call Logs</span>
              </div>
            </Link>

            <Link to="/analytics">
              <div className={`sidebar-item ${path === '/analytics' ? 'active' : ''}`}>
                <span className="sidebar-icon"><BarChart3 size={16} /></span>
                <span className="sidebar-text">Analytics</span>
              </div>
            </Link>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">CHAT</div>

            <Link to="/whatsapp">
              <div className={`sidebar-item ${path === '/whatsapp' ? 'active' : ''}`}>
                <span className="sidebar-icon"><MessageCircle size={16} /></span>
                <span className="sidebar-text">WhatsApp</span>
              </div>
            </Link>

            <Link to="/whatsapp">
              <div className={`sidebar-item ${path === '/whatsapp' ? 'active' : ''}`}>
                <span className="sidebar-icon"><MessageCircle size={16} /></span>
                <span className="sidebar-text">WhaBridge</span>
              </div>
            </Link>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">RESOURCES</div>

            <a href="/docs" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sidebar-item">
                <span className="sidebar-icon"><BookOpen size={16} /></span>
                <span className="sidebar-text">Docs</span>
              </div>
            </a>

            <Link to="/contact">
              <div className={`sidebar-item ${path === '/contact' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Mail size={16} /></span>
                <span className="sidebar-text">Contact Us</span>
              </div>
            </Link>

            <a href="/report-issue" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sidebar-item">
                <span className="sidebar-icon"><Bug size={16} /></span>
                <span className="sidebar-text">Report Issue</span>
              </div>
            </a>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-category">ACCOUNT & BILLING</div>

            {user.role === 'Admin' && (
              <Link to="/admin">
                <div className={`sidebar-item ${path === '/admin' ? 'active' : ''}`} style={{ position: 'relative' }}>
                  <span className="sidebar-icon"><Shield size={16} /></span>
                  <span className="sidebar-text">Admin Panel</span>
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: '1px 6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 9, fontWeight: 800, color: '#f87171', letterSpacing: '0.3px' }}>ADMIN</span>
                </div>
              </Link>
            )}

            <Link to="/billing">
              <div className={`sidebar-item ${path === '/billing' ? 'active' : ''}`}>
                <span className="sidebar-icon"><CreditCard size={16} /></span>
                <span className="sidebar-text">Billing</span>
              </div>
            </Link>

            <Link to="/api_keys">
              <div className={`sidebar-item ${path === '/api_keys' ? 'active' : ''}`}>
                <span className="sidebar-icon"><Key size={16} /></span>
                <span className="sidebar-text">API</span>
              </div>
            </Link>
          </div>
        </div>

        <div className="sidebar-spacer"></div>

        <div className="sidebar-bottom">
          <Link to="/settings">
            <div className={`sidebar-item ${path === '/settings' ? 'active' : ''}`}>
              <span className="sidebar-icon"><Settings size={16} /></span>
              <span className="sidebar-text">Settings</span>
            </div>
          </Link>
          <div
            className="sidebar-item"
            onClick={handleLogout}
            style={{ cursor: 'pointer' }}
          >
            <span className="sidebar-icon"><LogOut size={16} /></span>
            <span className="sidebar-text">Logout</span>
          </div>
        </div>
      </aside>

      <div className="topbar-fixed">
        <div className="dashboard-topbar">
          {/* Hamburger — visible on mobile only, toggles the layout sidebar */}
          <button
            id="hamburger-btn"
            className="omni-hamburger"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div
            className="topbar-search"
            onClick={() => setIsCommandMenuOpen(true)}
            style={{ cursor: 'pointer' }}
          >
            <Search size={16} />
            <input
              type="text"
              placeholder="Search or jump to..."
              readOnly
              style={{ cursor: 'pointer' }}
            />
            <span>⌘ K</span>
          </div>
          <CommandMenu open={isCommandMenuOpen} setOpen={setIsCommandMenuOpen} />
          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-icon-btn"
              style={{ position: 'relative' }}
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 4px',
                    background: 'var(--teal)',
                    color: '#060c17',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    border: '1.5px solid var(--topbar-bg)',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <button className="topbar-icon-btn" onClick={toggleDarkMode} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              {darkMode ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              )}
            </button>

            <div ref={profileRef} style={{ position: 'relative', marginLeft: '2px' }}>
              <div
                className="topbar-avatar"
                onClick={() => setProfileDropdownOpen(prev => !prev)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {user.initials}
              </div>

              {profileDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 12px)',
                  right: 0,
                  width: '264px',
                  background: 'var(--dropdown-bg)',
                  border: '1px solid var(--dropdown-border)',
                  borderRadius: '14px',
                  boxShadow: darkMode
                    ? '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)'
                    : '0 8px 32px rgba(15,23,42,0.14), 0 0 0 1px rgba(0,0,0,0.04)',
                  zIndex: 9999,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid var(--dropdown-border)', display: 'flex', alignItems: 'center', gap: '12px', background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), #0cd4bc)', color: '#060c17', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0, boxShadow: '0 0 0 2px var(--teal-light)' }}>
                      {user.initials}
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ fontWeight: '700', fontSize: '13.5px', color: 'var(--dropdown-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>{user.email}</div>
                      {user.plan && (
                        <span style={{ marginTop: '5px', display: 'inline-block', fontSize: '9px', fontWeight: '800', padding: '2px 8px', background: 'var(--teal-light)', color: 'var(--teal)', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user.plan}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '6px 0', borderBottom: '1px solid var(--dropdown-border)' }}>
                    {[
                      { to: '/profile', label: 'Profile', icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
                      { to: '/settings', label: 'Settings', icon: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></> },
                      { to: '/billing', label: 'Billing', icon: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></> },
                    ].map(item => (
                      <Link key={item.to} to={item.to} onClick={() => setProfileDropdownOpen(false)}
                        style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', textDecoration: 'none', color: 'var(--dropdown-text)', fontSize: '13.5px', fontWeight: '500', transition: 'background 0.15s' }}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--dropdown-hover)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px', opacity: 0.6 }}>{item.icon}</svg>
                        {item.label}
                      </Link>
                    ))}
                  </div>

                  <div style={{ padding: '6px 0' }}>
                    <div
                      onClick={() => { setProfileDropdownOpen(false); handleLogout(); }}
                      style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', cursor: 'pointer', color: 'var(--error)', fontSize: '13.5px', fontWeight: '500', transition: 'background 0.15s' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--dropdown-hover)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px', opacity: 0.8 }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Log out
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="dashboard-main">
        <div className="dashboard-content">
          {children}
        </div>
      </main>

      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onUnreadCountChange={setUnreadCount}
      />

      {/* ── Mobile sidebar styles injected here so they live with the layout ── */}
      <style>{`
        /* Hamburger: hidden on desktop, shown on mobile */
        .omni-hamburger {
          display: none;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-primary, #e2e8f0);
          flex-shrink: 0;
          transition: background 0.2s;
        }
        .omni-hamburger:hover {
          background: var(--sidebar-hover, rgba(255,255,255,0.06));
        }

        /* Mobile sidebar overlay */
        .sidebar-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 998;
          animation: overlayFadeIn 0.2s ease;
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @media (max-width: 768px) {
          /* Show hamburger on mobile */
          .omni-hamburger {
            display: flex;
          }

          /* On mobile the sidebar is off-screen by default, slides in when .open */
          .sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            height: 100vh !important;
            z-index: 999 !important;
            transform: translateX(-100%) !important;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            /* width is already set by your existing sidebar styles */
          }
          .sidebar.open {
            transform: translateX(0) !important;
          }

          /* Prevent the main area from being pushed on mobile */
          .dashboard-main {
            margin-left: 0 !important;
          }

          /* Topbar: make sure it spans full width on mobile */
          .topbar-fixed {
            left: 0 !important;
          }

          /* Shrink search bar on mobile to give hamburger room */
          .topbar-search {
            flex: 1;
            min-width: 0;
          }
          .topbar-search input {
            min-width: 0;
          }
          .topbar-search span {
            display: none;
          }
        }

        @media (min-width: 769px) {
          /* On desktop, hide overlay and keep sidebar always visible */
          .sidebar-overlay {
            display: none !important;
          }
          .omni-hamburger {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
