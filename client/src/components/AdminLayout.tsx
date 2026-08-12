import { useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import {
  Shield, BarChart3, Users, Bug, CreditCard, TrendingUp,
  Activity, ScrollText, LogOut, Menu, X, ChevronDown, CalendarDays, PhoneCall, Cpu,
} from 'lucide-react';
import { clearAuth, decodeJwtPayload, getToken } from '@/lib/authStorage';

/**
 * The super-admin console shell.
 *
 * Deliberately a SEPARATE layout from DashboardLayout rather than another tab
 * inside it. The admin panel is a different product for a different person:
 * mixing it into the customer sidebar meant the platform owner had to navigate
 * the customer's own agent/billing/whatsapp nav to reach platform tools, and
 * one stray click landed them back in a tenant view.
 *
 * Nav is grouped by concern rather than listed flat — the console spans user
 * administration, money, telephony and system operations, and a flat list of
 * a dozen links gives no cue about which of those you are in.
 */

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: <BarChart3 size={16} /> },
    ],
  },
  {
    title: 'Customers',
    items: [
      { to: '/admin/users', label: 'Users', icon: <Users size={16} /> },
      { to: '/admin/appointments', label: 'Appointments', icon: <CalendarDays size={16} /> },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/calls', label: 'Call Logs', icon: <PhoneCall size={16} /> },
      { to: '/admin/models', label: 'Models', icon: <Cpu size={16} /> },
    ],
  },
  {
    title: 'Billing',
    items: [
      { to: '/admin/billing', label: 'Revenue & Invoices', icon: <CreditCard size={16} /> },
      { to: '/admin/plans', label: 'Wallet Rate', icon: <TrendingUp size={16} /> },
      { to: '/admin/wallets', label: 'Wallet Credits', icon: <CreditCard size={16} /> },
    ],
  },
  {
    title: 'Telephony',
    items: [
    ],
  },
  {
    title: 'Support',
    items: [
      { to: '/admin/issues', label: 'Reported Issues', icon: <Bug size={16} /> },
    ],
  },
  {
    title: 'Security & System',
    items: [
      { to: '/admin/audit', label: 'Audit Log', icon: <ScrollText size={16} /> },
      { to: '/admin/health', label: 'System Health', icon: <Activity size={16} /> },
    ],
  },
];

const SIDEBAR_W = 248;

/**
 * Scoped to the console rather than the whole app: the customer pages fetch
 * their own way, and mounting a global client would silently change their
 * behaviour. Created once at module scope so it is not rebuilt (and its cache
 * discarded) on every re-render of the layout.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // An admin acting on stale platform data is the failure mode that matters
      // here, so refetch when the tab regains focus.
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export default function AdminLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminShell />
    </QueryClientProvider>
  );
}

function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const payload = decodeJwtPayload(getToken());
  const email = payload?.email ?? 'admin';

  // Close the drawer on navigation, or it stays open covering the page the
  // user just asked for.
  useEffect(() => { setMobileOpen(false); setMenuOpen(false); }, [location.pathname]);

  // Dismiss the account menu on an outside click or Escape. Without this the
  // only way to close it was clicking the avatar again, so it hung over the
  // page while the operator worked — and it sits above the content.
  // pointerdown (not click) so it closes on press, before the click lands on
  // whatever is underneath.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const isActive = (to: string) =>
    to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(to);

  const logout = () => { clearAuth(); navigate('/login', { replace: true }); };

  const sidebar = (
    <aside
      style={{
        width: SIDEBAR_W,
        flexShrink: 0,
        // --bg-2, not --s1: the rail sits *behind* the content plane in the
        // Resonance stack, so it reads as the recessed edge of the console
        // rather than a card floating next to one.
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        // The aside itself must NOT scroll. When it did, the brand header
        // scrolled off the top and the Sign out button was clipped at the
        // bottom; only the nav list should move.
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: 'rgba(14,179,158,0.14)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Shield size={17} style={{ color: 'var(--cyan-fg)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--ff-d)', fontSize: 14, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.2 }}>
              Admin Console
            </div>
            <div style={{ fontFamily: 'var(--ff-m)', fontSize: 10, fontWeight: 700, color: 'var(--err)', letterSpacing: '0.5px' }}>
              SUPERADMIN
            </div>
          </div>
        </div>
      </div>

      {/* minHeight:0 is what lets this flex child actually shrink and scroll
          instead of stretching the aside past the viewport. */}
      <nav className="admin-nav-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 10px' }}>
        {NAV.map((group) => (
          <div key={group.title} style={{ marginBottom: 12 }}>
            <div style={{
              fontFamily: 'var(--ff-m)', fontSize: 10, fontWeight: 700, letterSpacing: '0.7px',
              color: 'var(--tx-3)',
              textTransform: 'uppercase', padding: '0 10px', marginBottom: 6,
            }}>
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                    fontSize: 13.5, fontWeight: active ? 700 : 500,
                    color: active ? 'var(--cyan-fg)' : 'var(--tx-2)',
                    background: active ? 'rgba(14,179,158,0.10)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <span style={{ display: 'grid', placeItems: 'center' }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
        <button
          onClick={logout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 9,
            padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line)',
            background: 'transparent', color: 'var(--tx-2)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        // Same ambient wash the customer app uses, so the console reads as the
        // same product seen from the operator's side.
        background:
          'radial-gradient(900px 400px at 82% -10%, rgba(129,140,248,0.05), transparent 60%), var(--bg)',
      }}
    >
      {/* Desktop sidebar */}
      <div className="admin-sidebar-desktop">{sidebar}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', left: 0, top: 0, zIndex: 61 }}>
            {sidebar}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header
          style={{
            height: 56, flexShrink: 0,
            borderBottom: '1px solid var(--line)',
            background: 'var(--bg-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 18px', position: 'sticky', top: 0, zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              className="admin-menu-btn"
              onClick={() => setMobileOpen((v) => !v)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--tx-2)',
                cursor: 'pointer', padding: 4, display: 'none',
              }}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Breadcrumb pathname={location.pathname} />
          </div>

          <div ref={accountRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--line)',
                borderRadius: 20, padding: '5px 10px 5px 6px', color: 'var(--tx)',
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--cyan), var(--violet))',
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--ff-d)', fontSize: 11, fontWeight: 700, color: 'var(--on-cyan)',
              }}>
                {email.slice(0, 1).toUpperCase()}
              </span>
              <span style={{ fontSize: 12.5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </span>
              <ChevronDown size={14} style={{ color: 'var(--tx-2)' }} />
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '110%', minWidth: 180,
                background: 'var(--s1)', border: '1px solid var(--line-2)',
                borderRadius: 10, padding: 6, zIndex: 50,
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              }}>
                <button
                  onClick={logout}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent',
                    color: 'var(--tx)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main style={{ flex: 1, padding: '26px 28px 60px', minWidth: 0 }}>
          <div className="rz-wrap-wide" style={{ maxWidth: 1160 }}>
            <Outlet />
          </div>
        </main>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* The nav scrolls when the console outgrows short viewports, but a
           chunky OS scrollbar next to a 240px sidebar reads as a seam down the
           middle of the page. Overlay it: zero-width track, and a slim thumb
           that only materialises while the pointer is over the nav. */
        .admin-nav-scroll {
          scrollbar-width: none;          /* Firefox */
          -ms-overflow-style: none;       /* legacy Edge */
          overscroll-behavior: contain;   /* don't chain scroll to the page */
        }
        /* The 2px transparent border is restated from the global SCROLLBARS
           block in styles.css: it pads the thumb into a pill, and inheriting it
           onto a narrow track would leave nothing visible. 8px − 2×2px = 4px. */
        .admin-nav-scroll::-webkit-scrollbar { width: 8px; }
        .admin-nav-scroll::-webkit-scrollbar-track { background: transparent; }
        .admin-nav-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          border: 2px solid transparent;
          background-clip: padding-box;
          border-radius: 999px;
        }
        .admin-nav-scroll:hover { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.35) transparent; }
        .admin-nav-scroll:hover::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.30); background-clip: padding-box; }
        .admin-nav-scroll:hover::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.48); background-clip: padding-box; }

        @media (max-width: 900px) {
          .admin-sidebar-desktop { display: none; }
          .admin-menu-btn { display: block !important; }
        }
      `}</style>
    </div>
  );
}

/** Breadcrumb derived from the URL, so every page says where it is. */
function Breadcrumb({ pathname }: { pathname: string }) {
  const label = (() => {
    for (const g of NAV) {
      for (const i of g.items) {
        if (i.to === '/admin' ? pathname === '/admin' : pathname.startsWith(i.to)) return { group: g.title, page: i.label };
      }
    }
    return { group: 'Admin', page: '' };
  })();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, minWidth: 0 }}>
      <span style={{ color: 'var(--tx-2)' }}>{label.group}</span>
      {label.page && (
        <>
          <span style={{ color: 'var(--tx-2)', opacity: 0.5 }}>/</span>
          <span style={{ color: 'var(--tx)', fontWeight: 700 }}>{label.page}</span>
        </>
      )}
    </div>
  );
}
