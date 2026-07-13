import { useState, useEffect, useCallback } from 'react';
import { safeGet } from '@/lib/authStorage';
import {
  Users, Bot, Phone, BarChart3, TrendingUp, RefreshCw,
  Search, Filter, Plus, Trash2, UserCheck, UserX,
  PowerOff, RotateCcw, Globe, ChevronDown, X, Check,
  AlertCircle, Shield, Ban, ChevronLeft, ChevronRight,
  Eye, CreditCard, Bug
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  totalUsers: number;
  totalWorkspaces: number;
  totalAgents: number;
  totalNumbers: number;
  availableNumbers: number;
  assignedNumbers: number;
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

interface PoolNumber {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  status: string;
  assignedTo: string | null;
  registeredAt: string;
  createdAt: string;
  workspace?: {
    id: string;
    name: string;
    slug: string;
    agents: { id: string; name: string }[];
  } | null;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  planName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = (path: string) => `/api/v1/admin${path}`;

async function apiFetch(path: string, opts?: RequestInit) {
  const token = safeGet('token');
  const res = await fetch(API(path), {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

function statusColor(status: string) {
  switch (status.toUpperCase()) {
    case 'AVAILABLE': return { bg: 'rgba(14,179,158,0.12)', color: '#0eb39e', dot: '#0eb39e' };
    case 'ASSIGNED':  return { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', dot: '#818cf8' };
    case 'INACTIVE':  return { bg: 'rgba(255,255,255,0.06)', color: '#888', dot: '#666' };
    case 'BANNED':    return { bg: 'rgba(239,68,68,0.12)', color: '#f87171', dot: '#ef4444' };
    default:          return { bg: 'rgba(255,255,255,0.06)', color: '#888', dot: '#666' };
  }
}

function countryFlag(phone: string) {
  if (phone.startsWith('+91')) return '🇮🇳 IN';
  if (phone.startsWith('+1'))  return '🇺🇸 US';
  return '🌐';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBarChart({ data, valueKey, color = '#0eb39e' }: {
  data: ChartPoint[];
  valueKey: string;
  color?: string;
}) {
  if (!data.length) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>No data</div>;

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
                background: val > 0 ? color : 'rgba(255,255,255,0.06)',
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

function StatCard({ icon, label, value, sub, color = '#0eb39e' }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderTop: `2px solid ${color}`,
      borderRadius: 10,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
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
          border: `1px solid ${t.type === 'ok' ? '#0eb39e' : '#ef4444'}`,
          color: t.type === 'ok' ? '#0eb39e' : '#f87171',
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

function AssignModal({ number, workspaces, onClose, onAssign }: {
  number: PoolNumber;
  workspaces: Workspace[];
  onClose: () => void;
  onAssign: (numberId: string, workspaceId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!selected) return;
    setLoading(true);
    await onAssign(number.id, selected);
    setLoading(false);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0d1117', border: '1px solid var(--border)', borderRadius: 14,
        padding: 28, width: 420, maxWidth: '90vw',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Assign Number</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
          Assign <strong style={{ color: 'var(--text-primary)' }}>{number.phoneNumber}</strong> to a workspace
        </p>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              width: '100%', padding: '10px 36px 10px 14px', background: '#161b22',
              border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
              fontSize: 13, appearance: 'none', cursor: 'pointer',
            }}
          >
            <option value="">Select workspace...</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.planName})</option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: '#888', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleAssign}
            disabled={!selected || loading}
            style={{ padding: '8px 18px', background: selected ? '#0eb39e' : '#1a3a3a', border: 'none', borderRadius: 7, color: selected ? '#000' : '#555', fontSize: 13, fontWeight: 700, cursor: selected ? 'pointer' : 'not-allowed' }}
          >
            {loading ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Number Modal ─────────────────────────────────────────────────────────

function AddNumberModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (data: { phoneNumber: string; phoneNumberId: string; wabaId: string; accessToken: string; displayName: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ phoneNumber: '', phoneNumberId: '', wabaId: '', accessToken: '', displayName: '' });
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = async () => {
    if (!form.phoneNumber || !form.phoneNumberId || !form.wabaId || !form.accessToken) return;
    setLoading(true);
    await onAdd(form);
    setLoading(false);
    onClose();
  };

  const fields: { key: keyof typeof form; label: string; placeholder: string }[] = [
    { key: 'phoneNumber', label: 'Phone Number (E.164)', placeholder: '+919876543210' },
    { key: 'displayName', label: 'Display Name', placeholder: 'My Business Number' },
    { key: 'phoneNumberId', label: 'Meta Phone Number ID', placeholder: '1234567890' },
    { key: 'wabaId', label: 'WABA ID', placeholder: '9876543210' },
    { key: 'accessToken', label: 'Access Token', placeholder: 'EAAxxxxxxx...' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#0d1117', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Add Number to Pool</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>{f.label}</label>
              <input
                type={f.key === 'accessToken' ? 'password' : 'text'}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{ width: '100%', padding: '9px 14px', background: '#161b22', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: '#888', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleAdd}
            disabled={loading}
            style={{ padding: '8px 18px', background: '#0eb39e', border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            {loading ? 'Adding...' : 'Add Number'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [signups, setSignups] = useState<ChartPoint[]>([]);
  const [wsGrowth, setWsGrowth] = useState<ChartPoint[]>([]);
  const [agentChart, setAgentChart] = useState<ChartPoint[]>([]);
  const [topWs, setTopWs] = useState<TopWorkspace[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, sg, wg, ag, tw, ru] = await Promise.all([
        apiFetch('/analytics/overview'),
        apiFetch(`/analytics/signups?days=${days}`),
        apiFetch(`/analytics/workspace-growth?days=${days}`),
        apiFetch(`/analytics/agent-creation?days=${days}`),
        apiFetch('/analytics/top-workspaces?limit=10'),
        apiFetch('/analytics/recent-users?limit=15'),
      ]);
      setOverview(ov);
      setSignups(sg);
      setWsGrowth(wg);
      setAgentChart(ag);
      setTopWs(tw);
      setRecentUsers(ru);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-secondary)' }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Loading analytics...
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#f87171', padding: 24, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
      <AlertCircle size={18} /> {error}
      <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', background: 'transparent', border: '1px solid #f87171', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontSize: 12 }}>Retry</button>
    </div>
  );

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginRight: 4 }}>Period:</span>
        {[7, 14, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: days === d ? 'rgba(14,179,158,0.12)' : 'transparent',
            border: days === d ? '1px solid rgba(14,179,158,0.4)' : '1px solid var(--border)',
            color: days === d ? '#0eb39e' : 'var(--text-secondary)',
          }}>
            {d}d
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Overview stat cards */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          <StatCard icon={<Users size={18} />} label="Total Users" value={overview.totalUsers} sub="All registered accounts" />
          <StatCard icon={<Globe size={18} />} label="Total Workspaces" value={overview.totalWorkspaces} sub="Active organizations" color="#818cf8" />
          <StatCard icon={<Bot size={18} />} label="Total AI Agents" value={overview.totalAgents} sub="Across all workspaces" color="#f59e0b" />
          <StatCard icon={<Phone size={18} />} label="Total Numbers" value={overview.totalNumbers} sub="In number pool" color="#34d399" />
          <StatCard icon={<Check size={18} />} label="Available Numbers" value={overview.availableNumbers} sub="Ready to assign" color="#0eb39e" />
          <StatCard icon={<UserCheck size={18} />} label="Assigned Numbers" value={overview.assignedNumbers} sub="Currently in use" color="#818cf8" />
        </div>
      )}

      {/* Growth charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { title: 'User Signups', sub: `Last ${days} days`, data: signups, key: 'signups', color: '#0eb39e' },
          { title: 'New Workspaces', sub: `Last ${days} days`, data: wsGrowth, key: 'workspaces', color: '#818cf8' },
          { title: 'Agents Created', sub: `Last ${days} days`, data: agentChart, key: 'agents', color: '#f59e0b' },
        ].map((chart) => (
          <div key={chart.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{chart.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{chart.sub}</div>
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
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={15} style={{ color: '#0eb39e' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Top Workspaces by Agents</span>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {topWs.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>No workspaces yet</div>
            ) : topWs.map((w, i) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(14,179,158,0.12)', color: '#0eb39e', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{w.planName} · {w.memberCount} members</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0eb39e' }}>{w.agentCount}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>agents</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent users */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={15} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Signups</span>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {recentUsers.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>No users yet</div>
            ) : recentUsers.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #818cf8, #0eb39e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000', flexShrink: 0 }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDate(u.createdAt)}</div>
                  {u.workspace && <div style={{ fontSize: 10, color: '#0eb39e', marginTop: 2 }}>{u.workspace}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Number Pool Tab ──────────────────────────────────────────────────────────

function NumberPoolTab() {
  const [pool, setPool] = useState<PoolNumber[]>([]);
  const [summary, setSummary] = useState({ total: 0, available: 0, assigned: 0, inactive: 0, banned: 0 });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [assignTarget, setAssignTarget] = useState<PoolNumber | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const { toasts, show: toast } = useToast();

  const loadPool = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (countryFilter) params.set('country', countryFilter);
      if (search) params.set('search', search);

      const [poolData, wsData] = await Promise.all([
        apiFetch(`/numbers/pool?${params}`),
        apiFetch('/workspaces'),
      ]);
      setPool(poolData.pool ?? []);
      setSummary(poolData.summary ?? {});
      setWorkspaces(wsData.workspaces ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load number pool');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, countryFilter, search]);

  useEffect(() => { loadPool(); }, [loadPool]);

  const action = async (fn: () => Promise<unknown>, successMsg: string) => {
    try {
      await fn();
      toast(successMsg, 'ok');
      loadPool();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Action failed', 'err');
    }
  };

  const handleAssign = async (numberId: string, workspaceId: string) => {
    await action(
      () => apiFetch(`/numbers/pool/${numberId}/assign`, { method: 'PATCH', body: JSON.stringify({ workspaceId }) }),
      'Number assigned successfully'
    );
  };

  const handleUnassign = (id: string) =>
    action(() => apiFetch(`/numbers/pool/${id}/unassign`, { method: 'PATCH' }), 'Number unassigned');

  const handleDeactivate = (id: string) =>
    action(() => apiFetch(`/numbers/pool/${id}/deactivate`, { method: 'PATCH' }), 'Number deactivated');

  const handleReset = (id: string) =>
    action(() => apiFetch(`/numbers/pool/${id}/reset`, { method: 'PATCH' }), 'Number reset to Available');

  const handleDelete = (id: string, phone: string) => {
    if (!confirm(`Delete ${phone} from pool? This cannot be undone.`)) return;
    action(() => apiFetch(`/numbers/pool/${id}`, { method: 'DELETE' }), 'Number deleted');
  };

  const handleAdd = async (data: Parameters<typeof apiFetch>[1] extends undefined ? never : { phoneNumber: string; phoneNumberId: string; wabaId: string; accessToken: string; displayName: string }) => {
    await action(
      () => apiFetch('/numbers/add', { method: 'POST', body: JSON.stringify(data) }),
      'Number added to pool'
    );
  };

  return (
    <div>
      <ToastContainer toasts={toasts} />

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: summary.total, color: '#888' },
          { label: 'Available', value: summary.available, color: '#0eb39e' },
          { label: 'Assigned', value: summary.assigned, color: '#818cf8' },
          { label: 'Inactive', value: summary.inactive, color: '#666' },
          { label: 'Banned', value: summary.banned, color: '#f87171' },
        ].map((s) => (
          <div key={s.label} style={{ padding: '8px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters + Add button */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <input
            type="text"
            placeholder="Search by number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 34px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <Filter size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '9px 32px 9px 30px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: statusFilter ? 'white' : '#888', fontSize: 13, appearance: 'none', cursor: 'pointer' }}>
            <option value="">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="INACTIVE">Inactive</option>
            <option value="BANNED">Banned</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <Globe size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} style={{ padding: '9px 32px 9px 30px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: countryFilter ? 'white' : '#888', fontSize: 13, appearance: 'none', cursor: 'pointer' }}>
            <option value="">All Countries</option>
            <option value="IN">🇮🇳 India (+91)</option>
            <option value="US">🇺🇸 USA (+1)</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
        </div>

        <button onClick={loadPool} style={{ padding: '9px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} /> Refresh
        </button>

        <button onClick={() => setShowAddModal(true)} style={{ padding: '9px 18px', background: '#0eb39e', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={14} /> Add Number
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#f87171', padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                {['Phone Number', 'Country', 'Status', 'Assigned To', 'Agents', 'Added', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: 8 }} />Loading...
                </td></tr>
              ) : pool.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No numbers found</td></tr>
              ) : pool.map((num) => {
                const sc = statusColor(num.status);
                return (
                  <tr key={num.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>{num.phoneNumber}</div>
                      {num.displayName && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{num.displayName}</div>}
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>{countryFlag(num.phoneNumber)}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                        {num.status}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {num.workspace ? (
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{num.workspace.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/{num.workspace.slug}</div>
                        </div>
                      ) : <span style={{ color: '#555', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {num.workspace?.agents?.length ?? 0}
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {fmtDate(num.createdAt)}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {num.status === 'AVAILABLE' && (
                          <button onClick={() => setAssignTarget(num)} title="Assign to workspace"
                            style={{ padding: '5px 10px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 6, color: '#818cf8', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserCheck size={12} /> Assign
                          </button>
                        )}
                        {num.status === 'ASSIGNED' && (
                          <button onClick={() => handleUnassign(num.id)} title="Unassign"
                            style={{ padding: '5px 10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, color: '#f59e0b', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserX size={12} /> Unassign
                          </button>
                        )}
                        {(num.status === 'AVAILABLE' || num.status === 'ASSIGNED') && (
                          <button onClick={() => handleDeactivate(num.id)} title="Deactivate"
                            style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <PowerOff size={12} />
                          </button>
                        )}
                        {(num.status === 'INACTIVE' || num.status === 'BANNED') && (
                          <button onClick={() => handleReset(num.id)} title="Reset to Available"
                            style={{ padding: '5px 8px', background: 'rgba(14,179,158,0.08)', border: '1px solid rgba(14,179,158,0.2)', borderRadius: 6, color: '#0eb39e', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <RotateCcw size={12} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(num.id, num.phoneNumber)} title="Delete"
                          style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {assignTarget && (
        <AssignModal
          number={assignTarget}
          workspaces={workspaces}
          onClose={() => setAssignTarget(null)}
          onAssign={handleAssign}
        />
      )}
      {showAddModal && (
        <AddNumberModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAdd}
        />
      )}
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
      numberPool: { id: string; phoneNumber: string; status: string } | null;
      _count: { agents: number; campaigns: number; contacts: number };
    };
  }[];
}

const PLANS = ['Free', 'Starter', 'Pro', 'Enterprise'];

function planColor(plan: string) {
  switch (plan) {
    case 'Enterprise': return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' };
    case 'Pro':        return { bg: 'rgba(129,140,248,0.12)', color: '#818cf8' };
    case 'Starter':    return { bg: 'rgba(14,179,158,0.12)', color: '#0eb39e' };
    default:           return { bg: 'rgba(255,255,255,0.06)', color: '#888' };
  }
}

function UserDetailModal({ userId, onClose, onAction }: {
  userId: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [banReason, setBanReason] = useState('');
  const [showBanInput, setShowBanInput] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const { toasts, show: toast } = useToast();

  useEffect(() => {
    apiFetch(`/users/${userId}`).then((d) => { setUser(d); setSelectedPlan(d.planName); setLoading(false); }).catch(() => setLoading(false));
  }, [userId]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg, 'ok'); onAction(); onClose(); }
    catch (e: unknown) { toast(e instanceof Error ? e.message : 'Failed', 'err'); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#0d1117', border: '1px solid var(--border)', borderRadius: 16, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <ToastContainer toasts={toasts} />
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>User Details</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : !user ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#f87171' }}>User not found</div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* User info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #818cf8, #0eb39e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#000', flexShrink: 0 }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{user.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, ...planColor(user.planName) }}>{user.planName}</span>
                  {user.role && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(14,179,158,0.1)', color: '#0eb39e' }}>{user.role}</span>}
                  {user.banned && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>BANNED</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                <div>Joined {fmtDate(user.createdAt)}</div>
                <div style={{ marginTop: 4 }}>{user.workspaceCount} workspace{user.workspaceCount !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Workspaces + Agents */}
            {user.memberships?.map((m) => (
              <div key={m.workspace.id} style={{ marginBottom: 16, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{m.workspace.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>/{m.workspace.slug} · {m.role}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span>🤖 {m.workspace._count.agents} agents</span>
                    <span>📋 {m.workspace._count.campaigns} campaigns</span>
                    <span>👥 {m.workspace._count.contacts} contacts</span>
                  </div>
                </div>
                {m.workspace.agents.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {m.workspace.agents.map(a => (
                      <span key={a.id} style={{ padding: '4px 12px', background: 'rgba(14,179,158,0.08)', border: '1px solid rgba(14,179,158,0.2)', borderRadius: 6, fontSize: 12, color: '#0eb39e' }}>
                        🤖 {a.name} <span style={{ color: '#555', fontSize: 10 }}>({a.aiModel})</span>
                      </span>
                    ))}
                  </div>
                )}
                {m.workspace.numberPool && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    📞 {m.workspace.numberPool.phoneNumber} · <span style={{ color: statusColor(m.workspace.numberPool.status).color }}>{m.workspace.numberPool.status}</span>
                  </div>
                )}
              </div>
            ))}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              {/* Change plan */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 200 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <CreditCard size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
                  <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px 8px 30px', background: '#161b22', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, appearance: 'none' }}>
                    {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <button onClick={() => act(() => apiFetch(`/users/${user.id}/plan`, { method: 'PATCH', body: JSON.stringify({ planName: selectedPlan }) }), `Plan changed to ${selectedPlan}`)}
                  style={{ padding: '8px 14px', background: '#818cf8', border: 'none', borderRadius: 7, color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Change Plan
                </button>
              </div>

              {/* Ban/Unban */}
              {user.banned ? (
                <button onClick={() => act(() => apiFetch(`/users/${user.id}/unban`, { method: 'PATCH' }), 'User unbanned')}
                  style={{ padding: '8px 16px', background: 'rgba(14,179,158,0.1)', border: '1px solid rgba(14,179,158,0.3)', borderRadius: 7, color: '#0eb39e', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={13} /> Unban
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {showBanInput && (
                    <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason (optional)"
                      style={{ padding: '8px 12px', background: '#161b22', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 12, width: 180 }} />
                  )}
                  <button onClick={() => showBanInput ? act(() => apiFetch(`/users/${user.id}/ban`, { method: 'PATCH', body: JSON.stringify({ reason: banReason }) }), 'User banned') : setShowBanInput(true)}
                    style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, color: '#f87171', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ban size={13} /> {showBanInput ? 'Confirm Ban' : 'Ban User'}
                  </button>
                </div>
              )}

              {/* Delete */}
              <button onClick={() => { if (confirm(`Delete ${user.email}? This cannot be undone.`)) act(() => apiFetch(`/users/${user.id}`, { method: 'DELETE' }), 'User deleted'); }}
                style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserManagementTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
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
      if (planFilter) params.set('plan', planFilter);
      const data = await apiFetch(`/users?${params}`);
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally { setLoading(false); }
  }, [search, statusFilter, planFilter, page]);

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
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <input type="text" placeholder="Search name or email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '9px 14px 9px 34px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <Filter size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '9px 32px 9px 30px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: statusFilter ? 'white' : '#888', fontSize: 13, appearance: 'none', cursor: 'pointer' }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <CreditCard size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
            style={{ padding: '9px 32px 9px 30px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: planFilter ? 'white' : '#888', fontSize: 13, appearance: 'none', cursor: 'pointer' }}>
            <option value="">All Plans</option>
            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
        </div>

        <button onClick={load} style={{ padding: '9px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} /> Refresh
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}>{total} user{total !== 1 ? 's' : ''}</span>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#f87171', padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                {['User', 'Plan', 'Status', 'Workspace', 'Role', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: 8 }} />Loading...
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.banned ? 'rgba(239,68,68,0.2)' : 'linear-gradient(135deg, #818cf8, #0eb39e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: u.banned ? '#f87171' : '#000', flexShrink: 0 }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, ...planColor(u.planName) }}>{u.planName}</span>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {u.banned ? (
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> Banned
                      </span>
                    ) : (
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(14,179,158,0.12)', color: '#0eb39e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0eb39e', display: 'inline-block' }} /> Active
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {u.workspace ? (
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>{u.workspace.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>/{u.workspace.slug}</div>
                      </div>
                    ) : <span style={{ color: '#555', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>{u.role ?? '—'}</td>
                  <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setDetailUserId(u.id)} title="View details"
                        style={{ padding: '5px 8px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 6, color: '#818cf8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Eye size={12} />
                      </button>
                      {u.banned ? (
                        <button onClick={() => quickAction(() => apiFetch(`/users/${u.id}/unban`, { method: 'PATCH' }), 'User unbanned')} title="Unban"
                          style={{ padding: '5px 8px', background: 'rgba(14,179,158,0.1)', border: '1px solid rgba(14,179,158,0.3)', borderRadius: 6, color: '#0eb39e', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <UserCheck size={12} />
                        </button>
                      ) : (
                        <button onClick={() => quickAction(() => apiFetch(`/users/${u.id}/ban`, { method: 'PATCH', body: JSON.stringify({ reason: '' }) }), 'User banned')} title="Ban"
                          style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Ban size={12} />
                        </button>
                      )}
                      <button onClick={() => { if (confirm(`Delete ${u.email}?`)) quickAction(() => apiFetch(`/users/${u.id}`, { method: 'DELETE' }), 'User deleted'); }} title="Delete"
                        style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
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
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {page} of {pages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: page === 1 ? '#444' : 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: page === pages ? '#444' : 'white', cursor: page === pages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
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

function ReportIssuesTab() {
  const [issues, setIssues] = useState<ReportIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = safeGet('token');
      const res = await fetch('/api/v1/report-issue', {
        headers: { Authorization: `Bearer ${token}` },
      });
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
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <input
            type="text"
            placeholder="Search issues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 34px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={load}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}>
          {filtered.length} {filtered.length === 1 ? 'issue' : 'issues'}
        </span>
      </div>

      {/* States */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-secondary)', gap: 10 }}>
          <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading issues...
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#f87171', padding: 20, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
          <button onClick={load} style={{ marginLeft: 'auto', padding: '5px 12px', background: 'transparent', border: '1px solid #f87171', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontSize: 12 }}>Retry</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s', borderLeft: '3px solid #f59e0b' }}
            >
              {/* Header row */}
              <div
                onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12 }}
              >
                <Bug size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {issue.issueTitle}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Reported {new Date(issue.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <ChevronDown
                  size={14}
                  style={{ color: '#555', transition: 'transform 0.2s', transform: expanded === issue.id ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                />
              </div>

              {/* Expanded description */}
              {expanded === issue.id && (
                <div style={{ padding: '0 20px 18px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ paddingTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.5px', marginBottom: 6, textTransform: 'uppercase' }}>Description</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary, white)', lineHeight: 1.7, background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap' }}>
                      {issue.description}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>ID: </span>
                      <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>{issue.id}</span>
                    </div>
                    {issue.screenshotUrl && (
                      <a href={issue.screenshotUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#0eb39e' }}>
                        View Screenshot →
                      </a>
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

export default function AdminPanel() {
  const [tab, setTab] = useState<'analytics' | 'numbers' | 'users' | 'issues' | 'appointments' | 'plans' | 'wallets' | 'health'>('analytics');

  const tabs = [
    { id: 'analytics' as const, label: 'Analytics', icon: <BarChart3 size={15} /> },
    { id: 'users' as const, label: 'User Management', icon: <Users size={15} /> },
    { id: 'numbers' as const, label: 'Number Pools', icon: <Phone size={15} /> },
    { id: 'issues' as const, label: 'Report Issues', icon: <Bug size={15} /> },
    { id: 'appointments' as const, label: 'Appointments', icon: <CreditCard size={15} /> },
    { id: 'plans' as const, label: 'Plans & Pricing', icon: <TrendingUp size={15} /> },
    { id: 'wallets' as const, label: 'Wallet Credits', icon: <CreditCard size={15} /> },
    { id: 'health' as const, label: 'System Health', icon: <Shield size={15} /> },
  ];

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Shield size={22} style={{ color: '#0eb39e' }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0, color: 'var(--text-primary)' }}>Admin Panel</h1>
          <span style={{ padding: '3px 10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, fontSize: 10, fontWeight: 800, color: '#f87171', letterSpacing: '0.5px' }}>ADMIN ONLY</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
          Platform-wide analytics, user management, and number pool administration
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid #0eb39e' : '2px solid transparent',
              color: tab === t.id ? '#0eb39e' : 'var(--text-secondary)',
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'numbers' && <NumberPoolTab />}
      {tab === 'users' && <UserManagementTab />}
      {tab === 'issues' && <ReportIssuesTab />}
      {tab === 'appointments' && <AppointmentsTab />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'wallets' && <WalletCreditTab />}
      {tab === 'health' && <SystemHealthTab />}
    </>
  );
}


// ─── Sprint-2 admin tabs ──────────────────────────────────────────────────────

function AppointmentsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API('/appointments'), { headers: { Authorization: `Bearer ${safeGet('token')}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        setRows(Array.isArray(data) ? data : data.appointments ?? []);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
      finally { setLoading(false); }
    })();
  }, []);
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading appointments…</p>;
  if (err) return <p style={{ color: '#f87171' }}>Couldn’t load appointments: {err}</p>;
  if (!rows.length) return <p style={{ color: 'var(--text-muted)' }}>No appointment bookings submitted yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((a: any) => (
        <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong style={{ color: 'var(--text-primary, #fff)' }}>{a.name} — {a.email} · {a.phone}</strong>
            <span style={{ color: 'var(--text-muted)' }}>{new Date(a.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {a.projectType} · {a.role} · {a.industry} · vol: {a.callVolume} · {a.userType}
          </div>
          <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Use case: {a.useCase} — Reason: {a.reason}</div>
        </div>
      ))}
    </div>
  );
}

function PlansTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const hdrs = () => ({ Authorization: `Bearer ${safeGet('token')}`, 'Content-Type': 'application/json' });
  const load = async () => {
    try {
      const res = await fetch(API('/plans'), { headers: hdrs() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setPlans(data.plans ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { load(); }, []);
  const save = async (p: any) => {
    setSaving(p.id);
    try {
      const res = await fetch(API('/plans'), { method: 'POST', headers: hdrs(), body: JSON.stringify(p) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(null); }
  };
  const upd = (id: string, k: string, v: any) => setPlans(prev => prev.map(p => p.id === id ? { ...p, [k]: v } : p));
  if (err) return <p style={{ color: '#f87171' }}>Couldn’t load plans: {err}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>These values drive the public Pricing page and Billing — edits go live immediately.</p>
      {plans.length === 0 && !err && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '18px 0' }}>
          No plans found yet. Plans auto-seed on first load of the public pricing page (or on backend start) — if this stays empty, the database schema likely isn’t migrated (see System Health tab).
        </p>
      )}
      {plans.map(p => (
        <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <input value={p.name} onChange={e => upd(p.id, 'name', e.target.value)} style={adminInput} />
          <label style={lbl}>$/mo <input type="number" value={p.priceUsd} onChange={e => upd(p.id, 'priceUsd', Number(e.target.value))} style={adminInput} /></label>
          <label style={lbl}>$/min <input type="number" step="0.001" value={p.perMinuteUsd} onChange={e => upd(p.id, 'perMinuteUsd', Number(e.target.value))} style={adminInput} /></label>
          <label style={lbl}>mins <input type="number" value={p.includedMinutes} onChange={e => upd(p.id, 'includedMinutes', Number(e.target.value))} style={adminInput} /></label>
          <label style={lbl}>KB MB <input type="number" value={p.kbStorageMb} onChange={e => upd(p.id, 'kbStorageMb', Number(e.target.value))} style={adminInput} /></label>
          <button onClick={() => save(p)} disabled={saving === p.id} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--teal, #14b8a6)', background: 'transparent', color: 'var(--teal, #14b8a6)', cursor: 'pointer' }}>
            {saving === p.id ? 'Saving…' : 'Save'}
          </button>
        </div>
      ))}
    </div>
  );
}
const adminInput: React.CSSProperties = { width: '100%', padding: '7px 9px', background: 'var(--bg-secondary, #0f172a)', border: '1px solid var(--border, #334155)', borderRadius: 6, color: 'var(--text-primary, #fff)', fontSize: 13 };
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-muted)', fontSize: 11 };

function WalletCreditTab() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const credit = async () => {
    setMsg(null);
    const cents = Math.round(Number(amount) * 100);
    if (!workspaceId.trim() || !Number.isFinite(cents) || cents === 0) { setMsg('Enter a workspace ID and a non-zero USD amount.'); return; }
    try {
      const res = await fetch(API('/wallets/credit'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${safeGet('token')}`, 'Content-Type': 'application/json' },
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
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Manually credit (positive) or debit (negative) a workspace wallet — every change is recorded in the transaction ledger the user sees on Billing.</p>
      <input placeholder="Workspace ID" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={adminInput} />
      <input placeholder="Amount in USD (e.g. 25 or -5)" value={amount} onChange={e => setAmount(e.target.value)} style={adminInput} />
      <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} style={adminInput} />
      <button onClick={credit} style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--teal, #14b8a6)', background: 'transparent', color: 'var(--teal, #14b8a6)', cursor: 'pointer' }}>Apply credit</button>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('Done') ? '#4ade80' : '#f87171' }}>{msg}</div>}
    </div>
  );
}

function SystemHealthTab() {
  const [health, setHealth] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setErr(null);
    try {
      const res = await fetch(API('/health'), { headers: { Authorization: `Bearer ${safeGet('token')}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setHealth(data);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  if (err) return <p style={{ color: '#f87171' }}>Health check failed: {err}</p>;
  if (!health) return <p style={{ color: 'var(--text-muted)' }}>Checking system health…</p>;
  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, marginRight: 8,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: ok ? '#4ade80' : '#f87171',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>{label}</span>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
      <div><strong>Database:</strong> <Pill ok={health.db === 'connected'} label={health.db} /></div>
      <div><strong>Redis:</strong> <span style={{ color: 'var(--text-secondary)' }}>{health.redis}</span></div>
      <div>
        <strong>Providers:</strong>{' '}
        {Object.entries(health.providers || {}).map(([k, v]) => <Pill key={k} ok={Boolean(v)} label={`${k}${v ? '' : ' (no key)'}`} />)}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        JSON body limit: {health.jsonBodyLimit} · NODE_ENV: {health.nodeEnv} · refreshed {new Date(health.time).toLocaleTimeString()} (auto-refreshes every 15s)
      </div>
    </div>
  );
}
