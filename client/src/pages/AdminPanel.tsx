import { useState, useEffect, useCallback } from 'react';
import { adminFetch, API } from '@/lib/adminApi';
import { authFetch } from '@/lib/authFetch';
import {
  Users, Bot, Phone, BarChart3, TrendingUp, RefreshCw,
  Search, Filter, Trash2, UserCheck,
  Globe, ChevronDown, X, Check,
  AlertCircle, Ban, ChevronLeft, ChevronRight,
  Eye, Bug
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  totalUsers: number;
  totalWorkspaces: number;
  totalAgents: number;
  /*
    Null where this deployment has no number pool — the WhatsApp-era NumberPool
    table does not exist in every database the console runs against. Null is
    not zero: "0 numbers" would assert the pool is empty, when the truth is
    there is no pool. The three tiles are omitted rather than shown as 0.
  */
  totalNumbers: number | null;
  availableNumbers: number | null;
  assignedNumbers: number | null;
}

interface ChartPoint {
  date: string;
  signups?: number;
  workspaces?: number;
  agents?: number;
}

interface TopWorkspace {
  id: string;
  name: string;
  slug: string;
  planName: string;
  agentCount: number;
  memberCount: number;
  createdAt: string;
}

interface RecentUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  workspace: string | null;
  plan: string | null;
  role: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// One transport for the whole console, from lib/adminApi — it refreshes an
// expired access token and replays, so the panel no longer starts 401-ing once
// the ~15-min access token runs out.
const apiFetch = adminFetch;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBarChart({ data, valueKey, color = 'var(--cyan-fg)' }: {
  data: ChartPoint[];
  valueKey: string;
  color?: string;
}) {
  if (!data.length) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', fontFamily: 'var(--ff-m)', fontSize: 11 }}>No data</div>;

  const values = data.map((d) => (d as unknown as Record<string, number>)[valueKey] ?? 0);
  const max = Math.max(...values, 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, padding: '0 4px' }}>
      {data.map((d, i) => {
        const val = values[i];
        const h = Math.max((val / max) * 72, val > 0 ? 4 : 2);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div
              title={`${d.date}: ${val}`}
              style={{
                width: '100%',
                height: h,
                background: val > 0 ? color : 'var(--s3)',
                borderRadius: 2,
                transition: 'height 0.3s',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'var(--cyan-fg)' }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: 'var(--s1)',
      border: '1px solid var(--line)',
      borderTop: `2px solid ${color}`,
      borderRadius: 12,
      padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--tx-2)', fontWeight: 600 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontFamily: 'var(--ff-d)', fontSize: 28, fontWeight: 700, color: 'var(--tx)', letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'ok' | 'err' }[]>([]);
  const show = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: { id: number; msg: string; type: 'ok' | 'err' }[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: t.type === 'ok' ? 'rgba(14,179,158,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${t.type === 'ok' ? 'var(--cyan-fg)' : 'var(--err)'}`,
          color: t.type === 'ok' ? 'var(--cyan-fg)' : 'var(--err)',
          padding: '10px 18px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {t.type === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────

export function AnalyticsTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [signups, setSignups] = useState<ChartPoint[]>([]);
  const [wsGrowth, setWsGrowth] = useState<ChartPoint[]>([]);
  const [agentChart, setAgentChart] = useState<ChartPoint[]>([]);
  const [topWs, setTopWs] = useState<TopWorkspace[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /*
    allSettled, not all.

    These six requests are independent — the signup chart does not need the
    number pool to have loaded. Under Promise.all a single failing endpoint
    rejected the whole batch and the page rendered one error where five panels
    had perfectly good data behind them. That is how a missing NumberPool table
    turned into a blank dashboard.

    Now each panel fills in if its own request succeeded, and the banner names
    only what actually failed. The page is fully dead only if everything is.
  */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const requests = [
      ['Overview',        () => apiFetch('/analytics/overview'),                          setOverview],
      ['Signups',         () => apiFetch(`/analytics/signups?days=${days}`),              setSignups],
      ['Workspaces',      () => apiFetch(`/analytics/workspace-growth?days=${days}`),     setWsGrowth],
      ['Agents',          () => apiFetch(`/analytics/agent-creation?days=${days}`),       setAgentChart],
      ['Top workspaces',  () => apiFetch('/analytics/top-workspaces?limit=10'),           setTopWs],
      ['Recent signups',  () => apiFetch('/analytics/recent-users?limit=15'),             setRecentUsers],
    ] as const;

    const results = await Promise.allSettled(requests.map(([, fn]) => fn()));

    const failed: string[] = [];
    results.forEach((r, i) => {
      const [label, , apply] = requests[i];
      if (r.status === 'fulfilled') (apply as (v: unknown) => void)(r.value);
      else failed.push(label);
    });

    if (failed.length === requests.length) {
      setError('Could not reach the server. Check that the API is running.');
    } else if (failed.length) {
      setError(`Could not load: ${failed.join(', ')}. The rest of the page is up to date.`);
    }

    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--tx-2)' }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Loading analytics...
    </div>
  );

  const errorBanner = error ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--err)', padding: 16, marginBottom: 20, background: 'rgba(248,113,113,0.08)', borderRadius: 10, border: '1px solid rgba(248,113,113,0.28)', fontSize: 13 }}>
      <AlertCircle size={18} style={{ flexShrink: 0 }} /> {error}
      <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', background: 'transparent', border: '1px solid var(--err)', borderRadius: 6, color: 'var(--err)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>Retry</button>
    </div>
  ) : null;

  return (
    <div>
      {errorBanner}
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, alignItems: 'center' }}>
        <span style={{ color: 'var(--tx-2)', fontSize: 13, marginRight: 4 }}>Period:</span>
        {[7, 14, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: days === d ? 'rgba(14,179,158,0.12)' : 'transparent',
            border: days === d ? '1px solid rgba(14,179,158,0.4)' : '1px solid var(--line)',
            color: days === d ? 'var(--cyan-fg)' : 'var(--tx-2)',
          }}>
            {d}d
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--tx-2)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Overview stat cards */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          <StatCard icon={<Users size={18} />} label="Total Users" value={overview.totalUsers} sub="All registered accounts" />
          <StatCard icon={<Globe size={18} />} label="Total Workspaces" value={overview.totalWorkspaces} sub="Active organizations" color="var(--violet)" />
          <StatCard icon={<Bot size={18} />} label="Total AI Agents" value={overview.totalAgents} sub="Across all workspaces" color="var(--warn)" />
          {overview.totalNumbers !== null && (
            <StatCard icon={<Phone size={18} />} label="Total Numbers" value={overview.totalNumbers} sub="In number pool" color="var(--lime)" />
          )}
          {overview.availableNumbers !== null && (
            <StatCard icon={<Check size={18} />} label="Available Numbers" value={overview.availableNumbers} sub="Ready to assign" color="var(--cyan-fg)" />
          )}
          {overview.assignedNumbers !== null && (
            <StatCard icon={<UserCheck size={18} />} label="Assigned Numbers" value={overview.assignedNumbers} sub="Currently in use" color="var(--violet)" />
          )}
        </div>
      )}

      {/* Growth charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { title: 'User Signups', sub: `Last ${days} days`, data: signups, key: 'signups', color: 'var(--cyan-fg)' },
          { title: 'New Workspaces', sub: `Last ${days} days`, data: wsGrowth, key: 'workspaces', color: 'var(--violet)' },
          { title: 'Agents Created', sub: `Last ${days} days`, data: agentChart, key: 'agents', color: 'var(--warn)' },
        ].map((chart) => (
          <div key={chart.key} style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{chart.title}</div>
              <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>{chart.sub}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: chart.color, margin: '8px 0' }}>
              {chart.data.reduce((s, d) => s + ((d as unknown as Record<string, number>)[chart.key] ?? 0), 0)}
            </div>
            <MiniBarChart data={chart.data} valueKey={chart.key} color={chart.color} />
          </div>
        ))}
      </div>

      {/* Top workspaces + Recent users */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Top workspaces */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={15} style={{ color: 'var(--cyan-fg)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>Top Workspaces by Agents</span>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {topWs.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--tx-2)', fontSize: 13, textAlign: 'center' }}>No workspaces yet</div>
            ) : topWs.map((w, i) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(14,179,158,0.12)', color: 'var(--cyan-fg)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>{w.memberCount} members</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--cyan-fg)' }}>{w.agentCount}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx-2)' }}>agents</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent users */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={15} style={{ color: 'var(--violet)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>Recent Signups</span>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {recentUsers.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--tx-2)', fontSize: 13, textAlign: 'center' }}>No users yet</div>
            ) : recentUsers.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--cyan), var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-d)', fontSize: 12, fontWeight: 700, color: 'var(--on-cyan)', flexShrink: 0 }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>{fmtDate(u.createdAt)}</div>
                  {u.workspace && <div style={{ fontSize: 10, color: 'var(--cyan-fg)', marginTop: 2 }}>{u.workspace}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── User Management Tab ─────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  email: string;
  planName: string;
  banned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  createdAt: string;
  workspace: { id: string; name: string; slug: string } | null;
  role: string | null;
  workspaceCount: number;
}

interface UserDetail extends UserRow {
  memberships: {
    role: string;
    workspace: {
      id: string; name: string; slug: string;
      agents: { id: string; name: string; aiModel: string; createdAt: string }[];
      _count: { agents: number; campaigns: number };
    };
  }[];
}

/*
 * The plan badge, the plan filter and the "Change Plan" control used to live
 * here. All three are gone: there are no plans to assign, filter by or display.
 * A workspace's spending power is its wallet balance, managed under
 * Super Admin -> Wallets, and the rate it is charged is one platform-wide
 * number under Super Admin -> Pricing -> Default rate.
 */

function UserDetailModal({ userId, onClose, onAction }: {
  userId: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [banReason, setBanReason] = useState('');
  const [showBanInput, setShowBanInput] = useState(false);
  const { toasts, show: toast } = useToast();

  useEffect(() => {
    apiFetch(`/users/${userId}`).then((d) => { setUser(d); setLoading(false); }).catch(() => setLoading(false));
  }, [userId]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg, 'ok'); onAction(); onClose(); }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <ToastContainer toasts={toasts} />
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>User Details</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-2)' }}><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : !user ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--err)' }}>User not found</div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* User info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--line)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, var(--cyan), var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-d)', fontSize: 20, fontWeight: 700, color: 'var(--on-cyan)', flexShrink: 0 }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--tx)' }}>{user.name}</div>
                <div style={{ fontSize: 13, color: 'var(--tx-2)' }}>{user.email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {user.role && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(14,179,158,0.1)', color: 'var(--cyan-fg)' }}>{user.role}</span>}
                  {user.banned && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: 'var(--err)' }}>BANNED</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--tx-2)' }}>
                <div>Joined {fmtDate(user.createdAt)}</div>
                <div style={{ marginTop: 4 }}>{user.workspaceCount} workspace{user.workspaceCount !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Workspaces + Agents */}
            {user.memberships?.map((m) => (
              <div key={m.workspace.id} style={{ marginBottom: 16, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>{m.workspace.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>/{m.workspace.slug} · {m.role}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--tx-2)' }}>
                    <span>🤖 {m.workspace._count.agents} agents</span>
                    <span>📋 {m.workspace._count.campaigns} campaigns</span>
                  </div>
                </div>
                {m.workspace.agents.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {m.workspace.agents.map(a => (
                      <span key={a.id} style={{ padding: '4px 12px', background: 'rgba(14,179,158,0.08)', border: '1px solid rgba(14,179,158,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--cyan-fg)' }}>
                        🤖 {a.name} <span style={{ color: 'var(--tx-3)', fontSize: 10 }}>({a.aiModel})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              {/* Ban/Unban */}
              {user.banned ? (
                <button onClick={() => act(() => apiFetch(`/users/${user.id}/unban`, { method: 'PATCH' }), 'User unbanned')}
                  style={{ padding: '8px 16px', background: 'rgba(14,179,158,0.1)', border: '1px solid rgba(14,179,158,0.3)', borderRadius: 7, color: 'var(--cyan-fg)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={13} /> Unban
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {showBanInput && (
                    <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason (optional)"
                      style={{ padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--tx)', fontSize: 12, width: 180 }} />
                  )}
                  <button onClick={() => showBanInput ? act(() => apiFetch(`/users/${user.id}/ban`, { method: 'PATCH', body: JSON.stringify({ reason: banReason }) }), 'User banned') : setShowBanInput(true)}
                    style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, color: 'var(--err)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ban size={13} /> {showBanInput ? 'Confirm Ban' : 'Ban User'}
                  </button>
                </div>
              )}

              {/* Delete */}
              <button onClick={() => { if (confirm(`Delete ${user.email}? This cannot be undone.`)) act(() => apiFetch(`/users/${user.id}`, { method: 'DELETE' }), 'User deleted'); }}
                style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: 'var(--err)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UserManagementTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const { toasts, show: toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiFetch(`/users?${params}`);
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally { setLoading(false); }
  }, [search, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const quickAction = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg, 'ok'); load(); }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  };

  return (
    <div>
      <ToastContainer toasts={toasts} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-3)' }} />
          <input type="text" placeholder="Search name or email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '9px 14px 9px 34px', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <Filter size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-3)' }} />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '9px 32px 9px 30px', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 8, color: statusFilter ? 'white' : 'var(--tx-3)', fontSize: 13, appearance: 'none', cursor: 'pointer' }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-3)', pointerEvents: 'none' }} />
        </div>

        <button onClick={load} style={{ padding: '9px 14px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} /> Refresh
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--tx-2)' }}>{total} user{total !== 1 ? 's' : ''}</span>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--err)', padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,0.02)' }}>
                {['User', 'Status', 'Workspace', 'Role', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--tx-2)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--tx-2)' }}>
                  <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: 8 }} />Loading...
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--tx-2)' }}>No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.banned ? 'rgba(248,113,113,0.18)' : 'linear-gradient(135deg, var(--cyan), var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-d)', fontSize: 12, fontWeight: 700, color: u.banned ? 'var(--err)' : 'var(--on-cyan)', flexShrink: 0 }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--tx)' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {u.banned ? (
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: 'var(--err)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--err)', display: 'inline-block' }} /> Banned
                      </span>
                    ) : (
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(14,179,158,0.12)', color: 'var(--cyan-fg)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)', display: 'inline-block' }} /> Active
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {u.workspace ? (
                      <div>
                        <div style={{ color: 'var(--tx)', fontWeight: 600, fontSize: 12 }}>{u.workspace.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--tx-2)' }}>/{u.workspace.slug}</div>
                      </div>
                    ) : <span style={{ color: 'var(--tx-3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px', color: 'var(--tx-2)', fontSize: 12 }}>{u.role ?? '—'}</td>
                  <td style={{ padding: '13px 16px', color: 'var(--tx-2)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setDetailUserId(u.id)} title="View details"
                        style={{ padding: '5px 8px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 6, color: 'var(--violet)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Eye size={12} />
                      </button>
                      {u.banned ? (
                        <button onClick={() => quickAction(() => apiFetch(`/users/${u.id}/unban`, { method: 'PATCH' }), 'User unbanned')} title="Unban"
                          style={{ padding: '5px 8px', background: 'rgba(14,179,158,0.1)', border: '1px solid rgba(14,179,158,0.3)', borderRadius: 6, color: 'var(--cyan-fg)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <UserCheck size={12} />
                        </button>
                      ) : (
                        <button onClick={() => quickAction(() => apiFetch(`/users/${u.id}/ban`, { method: 'PATCH', body: JSON.stringify({ reason: '' }) }), 'User banned')} title="Ban"
                          style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: 'var(--err)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Ban size={12} />
                        </button>
                      )}
                      <button onClick={() => { if (confirm(`Delete ${u.email}?`)) quickAction(() => apiFetch(`/users/${u.id}`, { method: 'DELETE' }), 'User deleted'); }} title="Delete"
                        style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: 'var(--err)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>Page {page} of {pages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, color: page === 1 ? 'var(--line-2)' : 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, color: page === pages ? 'var(--line-2)' : 'white', cursor: page === pages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailUserId && (
        <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} onAction={load} />
      )}
    </div>
  );
}

// ─── Report Issues Tab ────────────────────────────────────────────────────────

interface ReportIssue {
  id: string;
  issueTitle: string;
  description: string;
  screenshotUrl: string | null;
  createdAt: string;
}

/**
 * The screenshot attached to a bug report.
 *
 * Fetched as a blob rather than pointed at with <img src>: the route is
 * admin-authenticated (screenshots routinely contain customer data) and an
 * <img> tag cannot send an Authorization header, so a bare src would render a
 * broken image. The object URL is released when the row collapses.
 */
function IssueScreenshot({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch(url);
        if (!res.ok) throw new Error(res.status === 404 ? 'Screenshot is missing from storage' : `Failed to load (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load screenshot');
      }
    })();

    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-2)', letterSpacing: '0.5px', marginBottom: 6, textTransform: 'uppercase' }}>
        Screenshot
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--err)' }}>{err}</div>}
      {!err && !src && <div style={{ fontSize: 12, color: 'var(--tx-2)' }}>Loading screenshot…</div>}
      {src && (
        <>
          {/* Opens full size in a new tab — a scaled-down thumbnail is rarely
              enough to read the error message the reporter was looking at. */}
          <a href={src} target="_blank" rel="noopener noreferrer">
            <img
              src={src}
              alt="Screenshot attached to this report"
              style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8, border: '1px solid var(--line)', display: 'block', cursor: 'zoom-in' }}
            />
          </a>
          <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--cyan-fg)', display: 'inline-block', marginTop: 6 }}>
            Open full size →
          </a>
        </>
      )}
    </div>
  );
}

export function ReportIssuesTab() {
  const [issues, setIssues] = useState<ReportIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/v1/report-issue');
      if (!res.ok) throw new Error('Failed to load issues');
      const data = await res.json();
      setIssues(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = issues.filter(
    (i) =>
      i.issueTitle.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-3)' }} />
          <input
            type="text"
            placeholder="Search issues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 34px', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={load}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--tx-2)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--tx-2)' }}>
          {filtered.length} {filtered.length === 1 ? 'issue' : 'issues'}
        </span>
      </div>

      {/* States */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--tx-2)', gap: 10 }}>
          <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading issues...
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--err)', padding: 20, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
          <button onClick={load} style={{ marginLeft: 'auto', padding: '5px 12px', background: 'transparent', border: '1px solid var(--err)', borderRadius: 6, color: 'var(--err)', cursor: 'pointer', fontSize: 12 }}>Retry</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tx-2)', background: 'var(--s1)', borderRadius: 10, border: '1px solid var(--line)' }}>
          <Bug size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>No issues reported yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Submissions from the Report Issue form will appear here.</div>
        </div>
      )}

      {/* Issues list */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((issue) => (
            <div
              key={issue.id}
              style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s', borderLeft: '3px solid var(--warn)' }}
            >
              {/* Header row */}
              <div
                onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12 }}
              >
                <Bug size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {issue.issueTitle}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx-2)', marginTop: 2 }}>
                    Reported {new Date(issue.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <ChevronDown
                  size={14}
                  style={{ color: 'var(--tx-3)', transition: 'transform 0.2s', transform: expanded === issue.id ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                />
              </div>

              {/* Expanded description */}
              {expanded === issue.id && (
                <div style={{ padding: '0 20px 18px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ paddingTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-2)', letterSpacing: '0.5px', marginBottom: 6, textTransform: 'uppercase' }}>Description</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary, white)', lineHeight: 1.7, background: 'var(--bg-2)', padding: '12px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap' }}>
                      {issue.description}
                    </div>
                  </div>
                  {/* Rendered inline rather than behind a link: the screenshot is
                      usually the fastest way to understand the report. */}
                  {issue.screenshotUrl && <IssueScreenshot url={issue.screenshotUrl} />}

                  <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--tx-2)', fontWeight: 600 }}>ID: </span>
                      <span style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'monospace' }}>{issue.id}</span>
                    </div>
                    {!issue.screenshotUrl && (
                      <span style={{ fontSize: 11, color: 'var(--tx-2)' }}>No screenshot attached</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main AdminPanel Page ─────────────────────────────────────────────────────

/**
 * Page heading, shared by every admin route.
 *
 * Navigation moved out of this file and into AdminLayout's sidebar when the
 * console became its own shell, so what used to be a row of tabs is now a
 * per-page title.
 */
export function AdminPageHeader({ title, subtitle, icon }: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
        {icon && <span style={{ color: 'var(--cyan-fg)', display: 'grid', placeItems: 'center' }}>{icon}</span>}
        <h1 style={{ fontFamily: 'var(--ff-d)', fontSize: 23, fontWeight: 700, letterSpacing: '-0.5px', margin: 0, color: 'var(--tx)' }}>
          {title}
        </h1>
      </div>
      {subtitle && (
        <p style={{ color: 'var(--tx-2)', fontSize: 13.5, margin: 0 }}>{subtitle}</p>
      )}
    </div>
  );
}

/** `/admin` index — platform overview. */
export default function AdminPanel() {
  return (
    <>
      <AdminPageHeader
        title="Platform Overview"
        subtitle="Users, workspaces, agents and number pool across every tenant"
        icon={<BarChart3 size={21} />}
      />
      <AnalyticsTab />
    </>
  );
}


// ─── Sprint-2 admin tabs ──────────────────────────────────────────────────────

export function AppointmentsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(API('/appointments'));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        setRows(Array.isArray(data) ? data : data.appointments ?? []);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
      finally { setLoading(false); }
    })();
  }, []);
  if (loading) return <p style={{ color: 'var(--tx-3)' }}>Loading appointments…</p>;
  if (err) return <p style={{ color: 'var(--err)' }}>Couldn’t load appointments: {err}</p>;
  if (!rows.length) return <p style={{ color: 'var(--tx-3)' }}>No appointment bookings submitted yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((a: any) => (
        <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong style={{ color: 'var(--tx)' }}>{a.name} — {a.email} · {a.phone}</strong>
            <span style={{ color: 'var(--tx-3)' }}>{new Date(a.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ color: 'var(--tx-2)' }}>
            {a.projectType} · {a.role} · {a.industry} · vol: {a.callVolume} · {a.userType}
          </div>
          <div style={{ color: 'var(--tx-2)', marginTop: 4 }}>Use case: {a.useCase} — Reason: {a.reason}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * The platform wallet rate — the only pricing this deployment has.
 *
 * Rendered at the top of Super Admin → Pricing, above the volume tiers that
 * override it, so the fallback rate and the tiers that beat it are read together.
 * Replaces the old plan-catalogue editor. There are no plans: every call is
 * charged one rate per talk-minute against the workspace's wallet, and this is
 * where that number is set. It is also the number settlement deducts and the
 * number a signed-in customer sees in Billing, so what is quoted and what is
 * charged cannot drift apart. The marketing site no longer shows it at all:
 * the landing page and /pricing quote no figure and point at /contact instead.
 */
export function WalletRateTab({ onSaved }: { onSaved?: (perMinuteInr: number) => void } = {}) {
  const [rate, setRate] = useState<string>('');
  const [saved, setSaved] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await authFetch(API('/wallet-rate'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setRate(String(data.perMinuteInr));
      setSaved(data.perMinuteInr);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await authFetch(API('/wallet-rate'), {
        method: 'PUT', body: JSON.stringify({ perMinuteInr: Number(rate) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaved(data.perMinuteInr);
      setRate(String(data.perMinuteInr));
      // The tier table below quotes this same number as the "Default" a client
      // falls back to, so it has to hear about the change or it shows a stale one.
      onSaved?.(data.perMinuteInr);
      setMsg('Saved. Every call from now on is charged at this rate.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  };

  const parsed = Number(rate);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const dirty = valid && parsed !== saved;

  if (err) return <p style={{ color: 'var(--err)' }}>Couldn't load the rate: {err}</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 620 }}>
      <p style={{ color: 'var(--tx-3)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        The DEFAULT rupees-per-minute, deducted from the workspace's wallet. It applies to
        every client that has no volume tier and no per-client override — both of those beat
        this number. Tiers and per-client rates are set below.
      </p>

      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ ...lbl, fontSize: 12 }}>
          Rupees per minute
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 20, color: 'var(--tx-2)' }}>₹</span>
            <input
              type="number" step="0.01" min="0.01" value={rate}
              onChange={e => { setRate(e.target.value); setMsg(null); }}
              style={{ ...adminInput, fontSize: 20, padding: '10px 12px', maxWidth: 180 }}
            />
            <span style={{ fontSize: 13, color: 'var(--tx-3)' }}>/ minute</span>
          </div>
        </label>

        {/* The figure an admin actually reasons about is what a top-up buys. */}
        {valid && (
          <p style={{ color: 'var(--tx-3)', fontSize: 12, margin: 0 }}>
            A ₹1,000 top-up buys about {Math.floor(1000 / parsed).toLocaleString('en-IN')} minutes.
          </p>
        )}

        {!valid && rate !== '' && (
          <p style={{ color: 'var(--err)', fontSize: 12, margin: 0 }}>Enter a rate greater than zero.</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={save} disabled={!dirty || busy}
            style={{
              padding: '9px 16px', borderRadius: 8,
              border: '1px solid var(--teal, var(--cyan-fg))', background: dirty ? 'var(--teal, var(--cyan-fg))' : 'transparent',
              color: dirty ? 'var(--on-cyan)' : 'var(--teal, var(--cyan-fg))', fontWeight: 600,
              cursor: dirty && !busy ? 'pointer' : 'default', opacity: dirty || busy ? 1 : 0.5,
            }}
          >
            {busy ? 'Saving…' : 'Save rate'}
          </button>
          {msg && <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}


const adminInput: React.CSSProperties = { width: '100%', padding: '9px 11px', background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--tx)', fontFamily: 'var(--ff-b)', fontSize: 13 };
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--tx-3)', fontSize: 11 };

export function WalletCreditTab() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const credit = async () => {
    setMsg(null);
    const cents = Math.round(Number(amount) * 100);
    if (!workspaceId.trim() || !Number.isFinite(cents) || cents === 0) { setMsg('Enter a workspace ID and a non-zero USD amount.'); return; }
    try {
      const res = await authFetch(API('/wallets/credit'), {
        method: 'POST',
        body: JSON.stringify({ workspaceId: workspaceId.trim(), amountCents: cents, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credit failed');
      setMsg(`Done — new balance: $${(data.balanceCents / 100).toFixed(2)}`);
      setAmount(''); setNote('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Credit failed'); }
  };
  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Manually credit (positive) or debit (negative) a workspace wallet — every change is recorded in the transaction ledger the user sees on Billing.</p>
      <input placeholder="Workspace ID" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={adminInput} />
      <input placeholder="Amount in USD (e.g. 25 or -5)" value={amount} onChange={e => setAmount(e.target.value)} style={adminInput} />
      <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} style={adminInput} />
      <button onClick={credit} style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--teal, var(--cyan-fg))', background: 'transparent', color: 'var(--teal, var(--cyan-fg))', cursor: 'pointer' }}>Apply credit</button>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('Done') ? 'var(--lime)' : 'var(--err)' }}>{msg}</div>}
    </div>
  );
}

// ─── Model Access ─────────────────────────────────────────────────────────────

interface CatalogModel {
  id: string;
  value: string;
  label: string;
  provider: string;
  enabled: boolean;
  configured: boolean;
}
interface CatalogGroup {
  key: string;
  label: string;
  description: string;
  models: CatalogModel[];
}

/**
 * Which models clients can use.
 *
 * Every model the platform can run, in one list. Off means the model does not
 * appear in any client-side picker AND cannot be saved onto an agent even by
 * calling the API directly — the same toggle drives both, so what a client can
 * see and what a client can use never drift apart.
 *
 * Toggles save immediately and one at a time: two admins editing different
 * groups cannot overwrite each other, and there is no unsaved state to lose.
 */
export function ModelAccessTab() {
  const [groups, setGroups] = useState<CatalogGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await authFetch(API('/model-catalog'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setGroups(data.groups);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (model: CatalogModel) => {
    setSaving(model.id); setMsg(null);
    const next = !model.enabled;
    try {
      const res = await authFetch(API('/model-catalog'), {
        method: 'PUT',
        body: JSON.stringify({ updates: { [model.id]: next } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setGroups(data.groups);
      setMsg(`${model.label} is now ${next ? 'available to clients' : 'hidden from clients'}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(null); }
  };

  if (err) return <p style={{ color: 'var(--err)' }}>Couldn't load the model catalogue: {err}</p>;
  if (!groups) return <p style={{ color: 'var(--tx-3)' }}>Loading models…</p>;

  const totalOn = groups.reduce((n, g) => n + g.models.filter(m => m.enabled).length, 0);
  const total = groups.reduce((n, g) => n + g.models.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 860 }}>
      <p style={{ color: 'var(--tx-3)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        A model is offered to clients only while its toggle is on. Turning one off removes it from
        every picker in the product and refuses any attempt to save it onto an agent — including
        requests made directly against the API. {totalOn} of {total} models are currently available.
      </p>

      {msg && (
        <div style={{ fontSize: 12, color: 'var(--tx-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px' }}>
          {msg}
        </div>
      )}

      {groups.map(group => (
        <div key={group.key} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{group.label}</div>
            <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 3, lineHeight: 1.5 }}>{group.description}</div>
          </div>

          {group.models.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                opacity: m.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
                  {m.provider}
                  {/* An unconfigured model can be switched on, but it will fail at
                      call time — say so here rather than letting a client find out. */}
                  {!m.configured && (
                    <span style={{ color: 'var(--warn)' }}> · no API key configured on this server</span>
                  )}
                </div>
              </div>

              <span style={{ fontSize: 11, color: m.enabled ? 'var(--lime)' : 'var(--tx-3)', minWidth: 54, textAlign: 'right' }}>
                {m.enabled ? 'Visible' : 'Hidden'}
              </span>

              <button
                role="switch"
                aria-checked={m.enabled}
                aria-label={`${m.label}: ${m.enabled ? 'visible to clients' : 'hidden from clients'}`}
                disabled={saving === m.id}
                onClick={() => toggle(m)}
                style={{
                  position: 'relative', width: 42, height: 24, flexShrink: 0, borderRadius: 12,
                  border: '1px solid ' + (m.enabled ? 'var(--teal, var(--cyan-fg))' : 'var(--border, var(--line-2))'),
                  background: m.enabled ? 'var(--teal, var(--cyan-fg))' : 'transparent',
                  cursor: saving === m.id ? 'wait' : 'pointer', padding: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: 2, left: m.enabled ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: m.enabled ? 'var(--on-cyan)' : 'var(--text-muted, var(--tx-2))',
                    transition: 'left 0.15s',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SystemHealthTab() {
  const [health, setHealth] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setErr(null);
    try {
      const res = await authFetch(API('/health'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setHealth(data);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  if (err) return <p style={{ color: 'var(--err)' }}>Health check failed: {err}</p>;
  if (!health) return <p style={{ color: 'var(--tx-3)' }}>Checking system health…</p>;
  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, marginRight: 8,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: ok ? 'var(--lime)' : 'var(--err)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>{label}</span>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
      <div><strong>Database:</strong> <Pill ok={health.db === 'connected'} label={health.db} /></div>
      <div><strong>Redis:</strong> <span style={{ color: 'var(--tx-2)' }}>{health.redis}</span></div>
      <div>
        <strong>Providers:</strong>{' '}
        {Object.entries(health.providers || {}).map(([k, v]) => <Pill key={k} ok={Boolean(v)} label={`${k}${v ? '' : ' (no key)'}`} />)}
      </div>
      <div style={{ color: 'var(--tx-3)', fontSize: 12 }}>
        JSON body limit: {health.jsonBodyLimit} · NODE_ENV: {health.nodeEnv} · refreshed {new Date(health.time).toLocaleTimeString()} (auto-refreshes every 15s)
      </div>
    </div>
  );
}
