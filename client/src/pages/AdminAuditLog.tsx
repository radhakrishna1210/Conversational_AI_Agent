import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, ChevronLeft, ChevronRight, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { adminFetch, qs } from '@/lib/adminApi';
import { AdminPageHeader } from './AdminPanel';

interface AuditRow {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  actorIp: string | null;
  action: string;
  category: string;
  targetType: string | null;
  targetLabel: string | null;
  status: string;
  errorMessage: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  billing: '#f59e0b',
  security: '#f87171',
  user: '#818cf8',
  plan: '#0eb39e',
  number: '#38bdf8',
  agent: '#c084fc',
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'audit-logs', { page, category, status, search }],
    queryFn: () => adminFetch<{ logs: AuditRow[]; total: number; page: number; pages: number }>(
      `/audit-logs${qs({ page, limit: 25, category, status, search })}`,
    ),
    // Money and privilege changes are the point of this page; showing a cached
    // view after another admin has acted is worse than a brief spinner.
    staleTime: 10_000,
  });

  const logs = data?.logs ?? [];

  const applySearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); setPage(1); };
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };

  return (
    <>
      <AdminPageHeader
        title="Audit Log"
        subtitle="Every mutating admin action — who, what, when, and from where"
        icon={<ScrollText size={21} />}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <form onSubmit={applySearch} style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search actor, target or action…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 13,
            }}
          />
        </form>

        <Select value={category} onChange={reset(setCategory)} options={[
          { v: '', l: 'All categories' }, { v: 'billing', l: 'Billing' }, { v: 'security', l: 'Security' },
          { v: 'user', l: 'User' }, { v: 'plan', l: 'Plan' }, { v: 'number', l: 'Number' }, { v: 'agent', l: 'Agent' },
        ]} />

        <Select value={status} onChange={reset(setStatus)} options={[
          { v: '', l: 'All outcomes' }, { v: 'success', l: 'Success' }, { v: 'failure', l: 'Failure' },
        ]} />

        <button
          onClick={() => refetch()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : undefined }} />
          Refresh
        </button>
      </div>

      {isError && (
        <Notice tone="error">
          <AlertCircle size={15} /> {(error as Error)?.message ?? 'Failed to load the audit log'}
        </Notice>
      )}

      {isLoading && <Notice>Loading audit entries…</Notice>}

      {!isLoading && !isError && logs.length === 0 && (
        <Notice>
          No audit entries match these filters yet. Entries appear as soon as an admin action is taken —
          a wallet credit, a ban, or a plan change.
        </Notice>
      )}

      {logs.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Time', 'Actor', 'Action', 'Target', 'Outcome', ''].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => {
                  const open = expanded === row.id;
                  const colour = CATEGORY_COLOR[row.category] ?? '#94a3b8';
                  return (
                    <>
                      <tr
                        key={row.id}
                        onClick={() => setExpanded(open ? null : row.id)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {fmtTime(row.createdAt)}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                          <div style={{ fontWeight: 600 }}>{row.actorEmail ?? 'system'}</div>
                          {row.actorIp && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.actorIp}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: `${colour}1f`, color: colour, whiteSpace: 'nowrap',
                          }}>
                            {row.action}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                          {row.targetLabel ?? '—'}
                          {row.targetType && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.targetType}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: row.status === 'success' ? '#0eb39e' : '#f87171',
                          }}>
                            {row.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 11 }}>
                          {open ? 'hide' : 'details'}
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${row.id}-detail`}>
                          <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                              <Snippet label="Before" value={row.before} />
                              <Snippet label="After" value={row.after} />
                              <Snippet label="Metadata" value={row.metadata} />
                              {row.errorMessage && <Snippet label="Error" value={row.errorMessage} />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {data!.total} entr{data!.total === 1 ? 'y' : 'ies'} · page {data!.page} of {Math.max(data!.pages, 1)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <PageBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Prev</PageBtn>
              <PageBtn disabled={page >= (data!.pages || 1)} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={14} /></PageBtn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
      }}
    >
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7,
        border: '1px solid var(--border)', background: 'transparent', fontSize: 12,
        color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Snippet({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>
        {label}
      </div>
      <pre style={{
        margin: 0, padding: '8px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-primary)',
        overflowX: 'auto', maxHeight: 220,
      }}>
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderRadius: 10,
      border: `1px solid ${tone === 'error' ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
      background: tone === 'error' ? 'rgba(239,68,68,0.08)' : 'var(--bg-card)',
      color: tone === 'error' ? '#f87171' : 'var(--text-secondary)', fontSize: 13.5,
    }}>
      {children}
    </div>
  );
}
