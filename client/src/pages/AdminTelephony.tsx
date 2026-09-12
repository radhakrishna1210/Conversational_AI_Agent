import { Fragment, useCallback, useEffect, useState } from 'react';
import { adminFetch, qs } from '@/lib/adminApi';
import {
  PhoneCall, AlertTriangle, RefreshCw, Search, ShieldOff, ShieldCheck,
  Link2, Trash2, Check, X, Gauge,
} from 'lucide-react';
import { AdminPageHeader } from './AdminPanel';

/**
 * Super Admin → Numbers & Carrier.
 *
 * The operator's side of the number business. It exists because every one of
 * these actions was previously either impossible from the product or possible
 * only by hand in Plivo's own console — and the ones that matter (the kill
 * switch, releasing a number, offboarding a client) are exactly the ones a
 * customer later asks us to explain, so they are audited rather than silent.
 *
 * Six tabs, in the order an operator meets them: who is verified, what they
 * hold, who is waiting, whether our books agree with the carrier's, and the
 * ceiling everybody shares.
 */

type Tab = 'workspaces' | 'numbers' | 'requests' | 'audit' | 'reconciliation' | 'limits';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'requests', label: 'Requests' },
  { id: 'audit', label: 'Carrier audit' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'limits', label: 'Limits' },
];

/* ── Shared bits ───────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 10, padding: 16, background: 'var(--s1)',
};
const input: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--bg-2)', color: 'var(--tx)', fontSize: 13, minWidth: 0,
};
const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
  color: 'var(--tx-3)', textTransform: 'uppercase', padding: '8px 10px', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px', fontSize: 13, borderTop: '1px solid var(--line)', verticalAlign: 'top',
};
const mono: React.CSSProperties = { fontFamily: 'var(--ff-m)', fontSize: 12 };

const btn = (kind: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  padding: '6px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--line)',
  background: kind === 'primary' ? 'var(--cyan-fg)' : 'transparent',
  color: kind === 'primary' ? 'var(--on-cyan)' : kind === 'danger' ? 'var(--err)' : 'var(--tx-2)',
  borderColor: kind === 'danger' ? 'rgba(248,113,113,0.4)' : 'var(--line)',
});

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'idle' | 'info'; children: React.ReactNode }) {
  const colors: Record<string, [string, string]> = {
    ok: ['rgba(52,211,153,0.12)', 'var(--lime, #34d399)'],
    warn: ['rgba(245,158,11,0.12)', '#f59e0b'],
    err: ['rgba(248,113,113,0.12)', 'var(--err)'],
    info: ['rgba(14,179,158,0.12)', 'var(--cyan-fg)'],
    idle: ['rgba(148,163,184,0.12)', 'var(--tx-3)'],
  };
  const [bg, fg] = colors[tone];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11,
      fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function Banner({ tone, children }: { tone: 'err' | 'warn' | 'ok'; children: React.ReactNode }) {
  const map = {
    err: ['rgba(248,113,113,0.08)', 'rgba(248,113,113,0.3)', 'var(--err)'],
    warn: ['rgba(245,158,11,0.08)', 'rgba(245,158,11,0.3)', '#f59e0b'],
    ok: ['rgba(52,211,153,0.08)', 'rgba(52,211,153,0.3)', 'var(--tx)'],
  }[tone];
  return (
    <div style={{
      padding: '10px 13px', borderRadius: 9, fontSize: 12.5, marginBottom: 14,
      background: map[0], border: `1px solid ${map[1]}`, color: map[2],
    }}>
      {children}
    </div>
  );
}

const rupees = (cents?: number | null) =>
  cents == null ? '—' : `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Every mutation on this page shares one shape: run it, show what broke, reload. */
function useAction(reload: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setError(null); setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, notice, setError, run };
}

/* ── Page ──────────────────────────────────────────────────────────────── */

interface Overview {
  carrier: { configured: boolean; selfServeRent: boolean; reconciliationScheduled: boolean };
  counts: { numbers: number; suspendedNumbers: number; pendingRequests: number; awaitingReview: number; subaccounts: number };
  rate: { monthlyInr: number; setupInr: number };
  concurrency: { carrierCeiling: number; perWorkspace: number; active: number; safetyBuffer: number };
  lastReconciliation: { id: string; status: string; startedAt: string; summary?: Summary | null } | null;
}

export default function AdminTelephony() {
  const [tab, setTab] = useState<Tab>('workspaces');
  const [overview, setOverview] = useState<Overview | null>(null);

  const loadOverview = useCallback(() => {
    adminFetch<Overview>('/telephony/overview').then(setOverview).catch(() => setOverview(null));
  }, []);
  useEffect(loadOverview, [loadOverview]);

  return (
    <>
      <AdminPageHeader
        title="Numbers & Carrier"
        subtitle="Carrier verification, the numbers each client holds, and whether our books agree with Plivo's"
        icon={<PhoneCall size={21} />}
      />

      {overview && !overview.carrier.configured && (
        <Banner tone="err">
          <strong>Plivo is not configured on this server.</strong> PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN are
          unset, so nothing here can reach the carrier — numbers cannot be rented or released, and the
          kill switch does nothing. The records below are still accurate.
        </Banner>
      )}

      {overview && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: 'Numbers held', value: overview.counts.numbers },
            { label: 'Suspended', value: overview.counts.suspendedNumbers, tone: overview.counts.suspendedNumbers ? 'err' : undefined },
            { label: 'Awaiting KYC review', value: overview.counts.awaitingReview },
            { label: 'Open requests', value: overview.counts.pendingRequests, tone: overview.counts.pendingRequests ? 'warn' : undefined },
            { label: 'Subaccounts', value: overview.counts.subaccounts },
            { label: 'Calls live now', value: `${overview.concurrency.active} / ${overview.concurrency.carrierCeiling - overview.concurrency.safetyBuffer}` },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '12px 16px', minWidth: 132, flex: '1 1 132px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px', color: 'var(--tx-3)', textTransform: 'uppercase' }}>
                {s.label}
              </div>
              <div style={{
                fontFamily: 'var(--ff-d)', fontSize: 22, fontWeight: 700, marginTop: 3,
                color: s.tone === 'err' ? 'var(--err)' : s.tone === 'warn' ? '#f59e0b' : 'var(--tx)',
              }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {overview && !overview.carrier.selfServeRent && (
        <p style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: -8, marginBottom: 18 }}>
          Clients cannot rent numbers themselves (PLIVO_SELF_SERVE_RENT is off), so their picks arrive
          in <strong>Requests</strong> for you to fulfil. Renting from here debits the client's wallet
          exactly as a self-serve purchase would.
        </p>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13.5, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--cyan-fg)' : 'var(--tx-2)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--cyan-fg)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {t.label}
            {t.id === 'requests' && overview?.counts.pendingRequests ? ` (${overview.counts.pendingRequests})` : ''}
          </button>
        ))}
      </div>

      {tab === 'workspaces' && <WorkspacesTab onChanged={loadOverview} />}
      {tab === 'numbers' && <NumbersTab onChanged={loadOverview} />}
      {tab === 'requests' && <RequestsTab onChanged={loadOverview} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'reconciliation' && <ReconciliationTab onChanged={loadOverview} />}
      {tab === 'limits' && <LimitsTab onChanged={loadOverview} />}
    </>
  );
}

/* ── Workspaces ────────────────────────────────────────────────────────── */

interface WorkspaceRow {
  workspaceId: string;
  workspaceName: string | null;
  entityName: string | null;
  useCase: string | null;
  carrierApplicationStatus: 'NOT_SUBMITTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  carrierApplicationRef: string | null;
  carrierRejectionReason: string | null;
  suspended: boolean;
  suspendedReason: string | null;
  subaccount: { authId: string; enabled: boolean; appId: string | null } | null;
  numbers: { active: number; suspended: number; released: number };
  pendingRequests: number;
  carrierDrift: boolean;
}

const APP_TONE: Record<WorkspaceRow['carrierApplicationStatus'], 'ok' | 'warn' | 'err' | 'idle'> = {
  APPROVED: 'ok', SUBMITTED: 'warn', REJECTED: 'err', NOT_SUBMITTED: 'idle',
};

function WorkspacesTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<WorkspaceRow[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    adminFetch<{ workspaces: WorkspaceRow[] }>(`/telephony/workspaces${qs({ filter })}`)
      .then(r => setRows(r.workspaces))
      .catch(() => setRows([]));
  }, [filter]);
  useEffect(load, [load]);

  const { busy, error, notice, run } = useAction(() => { load(); onChanged(); });

  const act = (row: WorkspaceRow) => ({
    suspend: (suspended: boolean) => {
      const reason = suspended ? window.prompt('Why is this workspace being suspended? The client sees this.') : null;
      if (suspended && reason === null) return;
      void run(
        `suspend:${row.workspaceId}`,
        () => adminFetch(`/telephony/workspaces/${row.workspaceId}/suspension`, {
          method: 'POST', body: JSON.stringify({ suspended, reason }),
        }),
        suspended ? 'Suspended here and at the carrier.' : 'Calling restored.',
      );
    },
    carrier: (enabled: boolean) => void run(
      `carrier:${row.workspaceId}`,
      () => adminFetch(`/telephony/workspaces/${row.workspaceId}/carrier-access`, {
        method: 'POST', body: JSON.stringify({ enabled }),
      }),
      enabled ? 'Carrier traffic re-enabled.' : 'Carrier traffic stopped.',
    ),
    relink: () => {
      const authId = window.prompt('Plivo subaccount auth id to link (e.g. SA2025RK4E639VJFZAMM):');
      if (!authId) return;
      void run(
        `relink:${row.workspaceId}`,
        () => adminFetch(`/telephony/workspaces/${row.workspaceId}/relink`, {
          method: 'POST', body: JSON.stringify({ authId, replace: Boolean(row.subaccount) }),
        }),
        'Linked. Its token was fetched from Plivo.',
      );
    },
    approve: () => void run(
      `approve:${row.workspaceId}`,
      () => adminFetch(`/telephony/workspaces/${row.workspaceId}/review`, {
        method: 'POST', body: JSON.stringify({ carrierApplicationStatus: 'APPROVED' }),
      }),
      'Recorded as approved.',
    ),
    reject: () => {
      const reason = window.prompt('Why did the carrier reject it? The client sees this.');
      if (!reason) return;
      void run(
        `reject:${row.workspaceId}`,
        () => adminFetch(`/telephony/workspaces/${row.workspaceId}/review`, {
          method: 'POST',
          body: JSON.stringify({ carrierApplicationStatus: 'REJECTED', carrierRejectionReason: reason }),
        }),
        'Recorded as rejected.',
      );
    },
    offboard: () => {
      const typed = window.prompt(
        `This releases every number ${row.workspaceName ?? row.workspaceId} holds and closes their carrier account. `
        + 'It cannot be undone — released numbers are never reissued and their DLT headers go with them.\n\n'
        + `Type the workspace id to confirm: ${row.workspaceId}`,
      );
      if (typed !== row.workspaceId) return;
      void run(
        `offboard:${row.workspaceId}`,
        () => adminFetch(`/telephony/workspaces/${row.workspaceId}/offboard`, {
          method: 'POST', body: JSON.stringify({ confirm: typed }),
        }),
        'Offboarded.',
      );
    },
  });

  return (
    <div>
      {error && <Banner tone="err">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['all', 'All'],
          ['awaiting_review', 'Awaiting review'],
          ['suspended', 'Suspended'],
          ['drift', 'Needs attention'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            style={{ ...btn(filter === id ? 'primary' : 'ghost') }}
          >
            {label}
          </button>
        ))}
        <button onClick={load} style={{ ...btn(), marginLeft: 'auto' }}>
          <RefreshCw size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Refresh
        </button>
      </div>

      {rows === null ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Nothing matches that filter.</p>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr>
                <th style={th}>Workspace</th>
                <th style={th}>KYC</th>
                <th style={th}>Carrier account</th>
                <th style={th}>Numbers</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const a = act(row);
                const isOpen = open === row.workspaceId;
                const working = Boolean(busy?.endsWith(row.workspaceId));
                return (
                  // Keyed on the Fragment, not the rows inside it: a row that
                  // expands renders two <tr>s, and React wants the key on the
                  // single element this map returns.
                  <Fragment key={row.workspaceId}>
                    <tr>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{row.workspaceName ?? '(no name)'}</div>
                        <div style={{ ...mono, color: 'var(--tx-3)' }}>{row.entityName ?? row.workspaceId}</div>
                        {row.suspended && (
                          <div style={{ marginTop: 4 }}><Pill tone="err">Suspended</Pill></div>
                        )}
                      </td>
                      <td style={td}>
                        <Pill tone={APP_TONE[row.carrierApplicationStatus]}>
                          {row.carrierApplicationStatus.replace('_', ' ').toLowerCase()}
                        </Pill>
                        {row.useCase && (
                          <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 4 }}>
                            {row.useCase === 'PROMOTIONAL' ? 'Promotional' : 'Transactional'}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {row.subaccount ? (
                          <>
                            <div style={mono}>{row.subaccount.authId}</div>
                            <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <Pill tone={row.subaccount.enabled ? 'ok' : 'err'}>
                                {row.subaccount.enabled ? 'enabled' : 'disabled'}
                              </Pill>
                              {!row.subaccount.appId && <Pill tone="idle">no app</Pill>}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--tx-3)', fontSize: 12.5 }}>none yet</span>
                        )}
                        {/* The one state that means a suspension is not actually
                            stopping anything. */}
                        {row.carrierDrift && (
                          <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--err)', maxWidth: 220 }}>
                            <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                            Suspended here but still enabled at Plivo — they can still dial.
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{ fontWeight: 600 }}>{row.numbers.active}</span>
                        <span style={{ color: 'var(--tx-3)' }}> active</span>
                        {row.numbers.suspended > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--err)' }}>{row.numbers.suspended} suspended</div>
                        )}
                        {row.pendingRequests > 0 && (
                          <div style={{ fontSize: 11.5, color: '#f59e0b' }}>{row.pendingRequests} requested</div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button style={btn()} onClick={() => setOpen(isOpen ? null : row.workspaceId)}>
                          {isOpen ? 'Close' : 'Manage'}
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td style={{ ...td, background: 'var(--bg-2)' }} colSpan={5}>
                          {row.carrierRejectionReason && (
                            <p style={{ fontSize: 12.5, color: 'var(--err)', margin: '0 0 10px' }}>
                              Carrier said: {row.carrierRejectionReason}
                            </p>
                          )}
                          {row.suspendedReason && (
                            <p style={{ fontSize: 12.5, color: 'var(--tx-2)', margin: '0 0 10px' }}>
                              Suspension reason: {row.suspendedReason}
                            </p>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {row.carrierApplicationStatus === 'SUBMITTED' && (
                              <>
                                <button style={btn('primary')} disabled={working} onClick={a.approve}>
                                  <Check size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Record approval
                                </button>
                                <button style={btn()} disabled={working} onClick={a.reject}>
                                  <X size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Record rejection
                                </button>
                              </>
                            )}
                            <button
                              style={btn(row.suspended ? 'primary' : 'danger')}
                              disabled={working}
                              onClick={() => a.suspend(!row.suspended)}
                            >
                              {row.suspended
                                ? <><ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Restore calling</>
                                : <><ShieldOff size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Suspend calling</>}
                            </button>
                            {row.subaccount && (
                              <button style={btn()} disabled={working} onClick={() => a.carrier(!row.subaccount!.enabled)}>
                                {row.subaccount.enabled ? 'Disable at carrier only' : 'Enable at carrier only'}
                              </button>
                            )}
                            <button style={btn()} disabled={working} onClick={a.relink}>
                              <Link2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                              {row.subaccount ? 'Relink subaccount' : 'Link existing subaccount'}
                            </button>
                            <button style={btn('danger')} disabled={working} onClick={a.offboard}>
                              <Trash2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Offboard
                            </button>
                          </div>
                          <p style={{ fontSize: 11.5, color: 'var(--tx-3)', margin: '10px 0 0', maxWidth: 620 }}>
                            Suspending stops calling here <em>and</em> at Plivo. Offboarding releases every number
                            and closes the carrier account — released numbers are never reissued and the client's
                            DLT headers go with them.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

interface NumberRow {
  id: string;
  phoneNumber: string;
  workspaceId: string;
  workspaceName: string | null;
  provider: string;
  subaccountId: string | null;
  series: string;
  status: string;
  headerStatus: string;
  inboundAgentId: string | null;
  dailyDialCap: number;
  clientMonthlyCents: number | null;
  carrierMonthlyCents: number | null;
  nextRenewalAt: string | null;
  assignedAt: string;
}

function NumbersTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<NumberRow[] | null>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setRows(null);
    adminFetch<{ numbers: NumberRow[] }>(`/telephony/numbers${qs({ status, q })}`)
      .then(r => setRows(r.numbers))
      .catch(() => setRows([]));
  }, [status, q]);
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const { busy, error, notice, run } = useAction(() => { load(); onChanged(); });

  const release = (row: NumberRow) => {
    const typed = window.prompt(
      `Releasing ${row.phoneNumber} gives it back to Plivo. It is never reissued to anyone, and the client's `
      + 'DLT header registration goes with it.\n\nType the number to confirm:',
    );
    if (typed !== row.phoneNumber) return;
    void run(
      row.id,
      () => adminFetch(`/telephony/numbers/${row.id}`, {
        method: 'DELETE', body: JSON.stringify({ workspaceId: row.workspaceId, confirm: typed }),
      }),
      `${row.phoneNumber} released.`,
    );
  };

  const setCap = (row: NumberRow) => {
    const raw = window.prompt(`Daily dial cap for ${row.phoneNumber}:`, String(row.dailyDialCap));
    if (!raw) return;
    void run(
      row.id,
      () => adminFetch(`/telephony/numbers/${row.id}`, {
        method: 'PATCH', body: JSON.stringify({ dailyDialCap: Number(raw) }),
      }),
      'Cap updated.',
    );
  };

  return (
    <div>
      {error && <Banner tone="err">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={input} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED_NONPAYMENT">Suspended</option>
          <option value="RELEASED">Released</option>
          <option value="ALL">All</option>
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            style={input}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(); }}
            placeholder="Search a number"
          />
          <button style={btn()} onClick={load}>
            <Search size={12} style={{ verticalAlign: -2 }} />
          </button>
        </div>
      </div>

      {rows === null ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>No numbers match.</p>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={th}>Number</th>
                <th style={th}>Workspace</th>
                <th style={th}>Carrier</th>
                <th style={th}>DLT header</th>
                <th style={th}>Client / carrier</th>
                <th style={th}>Renews</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td style={{ ...td, ...mono, fontSize: 13 }}>
                    {row.phoneNumber}
                    <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{row.series.replace(/_/g, ' ').toLowerCase()}</div>
                  </td>
                  <td style={td}>
                    {row.workspaceName ?? row.workspaceId}
                    {row.status !== 'ACTIVE' && (
                      <div style={{ marginTop: 3 }}>
                        <Pill tone={row.status === 'RELEASED' ? 'idle' : 'err'}>{row.status.toLowerCase().replace(/_/g, ' ')}</Pill>
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 12.5 }}>{row.provider}</div>
                    <div style={{ ...mono, color: 'var(--tx-3)', fontSize: 11 }}>{row.subaccountId ?? 'main account'}</div>
                  </td>
                  <td style={td}>
                    <Pill tone={row.headerStatus === 'REGISTERED' ? 'ok' : row.headerStatus === 'REJECTED' ? 'err' : 'warn'}>
                      {row.headerStatus.toLowerCase().replace(/_/g, ' ')}
                    </Pill>
                    {!row.inboundAgentId && row.status === 'ACTIVE' && (
                      <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 4 }}>no inbound agent</div>
                    )}
                  </td>
                  <td style={td}>
                    {/* Both sides of the margin, which is only visible here. */}
                    <div>{rupees(row.clientMonthlyCents)}<span style={{ color: 'var(--tx-3)' }}>/mo</span></div>
                    <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>costs {rupees(row.carrierMonthlyCents)}</div>
                  </td>
                  <td style={{ ...td, fontSize: 12.5, color: 'var(--tx-2)' }}>{when(row.nextRenewalAt)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.status !== 'RELEASED' && (
                      <>
                        <button style={btn()} disabled={busy === row.id} onClick={() => setCap(row)}>
                          Cap {row.dailyDialCap}
                        </button>{' '}
                        <button style={btn('danger')} disabled={busy === row.id} onClick={() => release(row)}>
                          Release
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Requests ──────────────────────────────────────────────────────────── */

interface RequestRow {
  id: string;
  workspaceId: string;
  phoneNumber: string;
  kind: 'RENT' | 'RELEASE';
  status: string;
  note: string | null;
  resolution: string | null;
  requestedBy: string | null;
  createdAt: string;
  workspace: { id: string; name: string } | null;
}

function RequestsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [status, setStatus] = useState('PENDING');

  const load = useCallback(() => {
    setRows(null);
    adminFetch<{ requests: RequestRow[] }>(`/telephony/requests${qs({ status })}`)
      .then(r => setRows(r.requests))
      .catch(() => setRows([]));
  }, [status]);
  useEffect(load, [load]);

  const { busy, error, notice, run } = useAction(() => { load(); onChanged(); });

  const fulfil = (row: RequestRow) => {
    if (row.kind === 'RELEASE') {
      // Irreversible, and it is the CLIENT who loses something they cannot get
      // back, so confirm against the number itself rather than an OK button.
      const typed = window.prompt(
        `Release ${row.phoneNumber} back to the carrier for ${row.workspace?.name ?? row.workspaceId}?\n\n`
        + 'It is never reissued to anyone, and their DLT header registration goes with it. '
        + 'Monthly billing stops.\n\nType the number to confirm:',
      );
      if (typed !== row.phoneNumber) return;
      void run(
        row.id,
        () => adminFetch(`/telephony/requests/${row.id}/fulfil`, { method: 'POST', body: '{}' }),
        'Released. The client has been notified.',
      );
      return;
    }
    const alt = window.prompt(
      `Rent a number for ${row.workspace?.name ?? row.workspaceId} and debit their wallet.\n\n`
      + 'Leave as-is to take the number they asked for, or type a different one if it has gone:',
      row.phoneNumber,
    );
    if (!alt) return;
    void run(
      row.id,
      () => adminFetch(`/telephony/requests/${row.id}/fulfil`, {
        method: 'POST',
        body: JSON.stringify(alt === row.phoneNumber ? {} : { phoneNumber: alt }),
      }),
      'Allocated. The client has been notified.',
    );
  };

  const decline = (row: RequestRow) => {
    const reason = window.prompt('Why can this not be allocated? The client sees this.');
    if (!reason) return;
    void run(
      row.id,
      () => adminFetch(`/telephony/requests/${row.id}/decline`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }),
      'Declined, and the client told why.',
    );
  };

  return (
    <div>
      {error && <Banner tone="err">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select style={input} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="PENDING">Open</option>
          <option value="FULFILLED">Fulfilled</option>
          <option value="DECLINED">Declined</option>
          <option value="ALL">All</option>
        </select>
      </div>

      {rows === null ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>
          {status === 'PENDING' ? 'Nobody is waiting for a number.' : 'Nothing here.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(row => (
            <div key={row.id} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ ...mono, fontSize: 14, fontWeight: 600 }}>{row.phoneNumber}</span>
                  {/* Which way this request goes. Allocating and releasing look
                      identical in a queue otherwise, and one of them is
                      irreversible. */}
                  <Pill tone={row.kind === 'RELEASE' ? 'err' : 'info'}>
                    {row.kind === 'RELEASE' ? 'give up' : 'allocate'}
                  </Pill>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-2)', marginTop: 2 }}>
                  {row.workspace?.name ?? row.workspaceId}
                  {row.requestedBy ? ` · ${row.requestedBy}` : ''} · {when(row.createdAt)}
                </div>
                {row.note && <div style={{ fontSize: 12.5, marginTop: 6 }}>{row.note}</div>}
                {/* A failed attempt leaves its error here, so the next person to
                    open the queue sees why it is still open. */}
                {row.resolution && (
                  <div style={{ fontSize: 12, marginTop: 6, color: row.status === 'PENDING' ? 'var(--err)' : 'var(--tx-3)' }}>
                    {row.resolution}
                  </div>
                )}
              </div>
              {row.status === 'PENDING' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={btn(row.kind === 'RELEASE' ? 'danger' : 'primary')}
                    disabled={busy === row.id}
                    onClick={() => fulfil(row)}
                  >
                    {busy === row.id
                      ? (row.kind === 'RELEASE' ? 'Releasing…' : 'Renting…')
                      : (row.kind === 'RELEASE' ? 'Release' : 'Allocate')}
                  </button>
                  <button style={btn()} disabled={busy === row.id} onClick={() => decline(row)}>Decline</button>
                </div>
              ) : (
                <Pill tone={row.status === 'FULFILLED' ? 'ok' : 'idle'}>{row.status.toLowerCase()}</Pill>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Carrier audit ─────────────────────────────────────────────────────── */

interface AuditResult {
  checkedAt: string;
  carrierCount: number;
  localCount: number;
  orphaned: Array<{ authId: string; name: string; enabled: boolean; claimedWorkspaceId: string | null; workspaceName: string | null; workspaceExists: boolean }>;
  missingAtCarrier: Array<{ authId: string; workspaceId: string; name: string }>;
  enabledDrift: Array<{ authId: string; workspaceId: string; carrierEnabled: boolean; ourEnabled: boolean }>;
}

function AuditTab() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    adminFetch<AuditResult>('/telephony/audit')
      .then(setResult)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not reach the carrier.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const clean = result && !result.orphaned.length && !result.missingAtCarrier.length && !result.enabledDrift.length;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-3)', margin: '0 0 14px', maxWidth: 660 }}>
        Every subaccount under our Plivo account, against our own records. A subaccount we do not track
        is billing us for numbers nobody manages; a record with no subaccount behind it fails every dial
        that workspace makes.
      </p>

      <button style={{ ...btn('primary'), marginBottom: 14 }} disabled={loading} onClick={load}>
        <RefreshCw size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
        {loading ? 'Checking…' : 'Re-check'}
      </button>

      {error && <Banner tone="err">{error}</Banner>}

      {result && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--tx-2)', marginBottom: 14 }}>
            {result.carrierCount} at Plivo · {result.localCount} recorded here · checked {when(result.checkedAt)}
          </p>

          {clean && <Banner tone="ok">Everything matches.</Banner>}

          {result.enabledDrift.length > 0 && (
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Kill switch disagrees</div>
              {result.enabledDrift.map(d => (
                <div key={d.authId} style={{ fontSize: 12.5, marginBottom: 5 }}>
                  <span style={mono}>{d.authId}</span> · {d.workspaceId} — Plivo says{' '}
                  <strong>{d.carrierEnabled ? 'enabled' : 'disabled'}</strong>, we say{' '}
                  <strong>{d.ourEnabled ? 'enabled' : 'disabled'}</strong>.
                  {d.carrierEnabled && !d.ourEnabled && ' They can still dial.'}
                </div>
              ))}
            </div>
          )}

          {result.orphaned.length > 0 && (
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                At Plivo, untracked ({result.orphaned.length})
              </div>
              {result.orphaned.map(o => (
                <div key={o.authId} style={{ fontSize: 12.5, marginBottom: 5 }}>
                  <span style={mono}>{o.authId}</span> · {o.name || '(no name)'}
                  {o.workspaceExists
                    ? ` — belongs to ${o.workspaceName ?? o.claimedWorkspaceId}. Relink it from Workspaces.`
                    : ' — no workspace of that name exists. Delete it in the Plivo console.'}
                </div>
              ))}
            </div>
          )}

          {result.missingAtCarrier.length > 0 && (
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                Recorded here, gone at Plivo ({result.missingAtCarrier.length})
              </div>
              {result.missingAtCarrier.map(m => (
                <div key={m.authId} style={{ fontSize: 12.5, marginBottom: 5 }}>
                  <span style={mono}>{m.authId}</span> · {m.workspaceId} — every call this workspace places
                  will fail on credentials until it is relinked.
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Reconciliation ────────────────────────────────────────────────────── */

interface Summary {
  carrierCalls: number;
  carrierBilledSec: number;
  carrierAmount: number;
  matched: number;
  carrierOnly: number;
  oursOnly: number;
  durationMismatch: number;
  unbilled: number;
  accountErrors?: Array<{ account: string; error: string }>;
}

interface Run {
  id: string;
  trigger: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  summary: Summary | null;
  discrepancies?: Array<Record<string, unknown>> | null;
  error: string | null;
  startedAt: string;
}

const DRIFT = (s?: Summary | null) =>
  s ? s.carrierOnly + s.oursOnly + s.durationMismatch + s.unbilled : 0;

function ReconciliationTab({ onChanged }: { onChanged: () => void }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [detail, setDetail] = useState<Run | null>(null);

  const load = useCallback(() => {
    adminFetch<{ runs: Run[] }>('/telephony/reconciliation')
      .then(r => setRuns(r.runs))
      .catch(() => setRuns([]));
  }, []);
  useEffect(load, [load]);

  const { busy, error, notice, run: act } = useAction(() => { load(); onChanged(); });

  const open = (id: string) => {
    adminFetch<{ run: Run }>(`/telephony/reconciliation/${id}`).then(r => setDetail(r.run)).catch(() => {});
  };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-3)', margin: '0 0 14px', maxWidth: 680 }}>
        Plivo's own call records against ours, once a day. It finds calls the carrier billed that we never
        logged, and calls we billed a wallet for that the carrier has no record of. Findings are flagged
        only — no wallet is ever adjusted from carrier data.
      </p>

      {error && <Banner tone="err">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      <button
        style={{ ...btn('primary'), marginBottom: 14 }}
        disabled={busy === 'run'}
        onClick={() => void act('run', () => adminFetch('/telephony/reconciliation', { method: 'POST', body: '{}' }), 'Run complete.')}
      >
        {busy === 'run' ? 'Running…' : 'Run for the last 24 hours'}
      </button>

      {runs === null ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>Loading…</p>
      ) : runs.length === 0 ? (
        <p style={{ color: 'var(--tx-3)', fontSize: 13 }}>No runs yet. The daily sweep starts a few minutes after the server boots.</p>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Window</th>
                <th style={th}>Status</th>
                <th style={th}>Carrier calls</th>
                <th style={th}>Matched</th>
                <th style={th}>Drift</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontSize: 12.5 }}>
                    {when(r.windowStart)} → {when(r.windowEnd)}
                    <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{r.trigger}</div>
                  </td>
                  <td style={td}>
                    <Pill tone={r.status === 'COMPLETED' ? 'ok' : r.status === 'FAILED' ? 'err' : 'warn'}>
                      {r.status.toLowerCase()}
                    </Pill>
                    {r.error && <div style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 4, maxWidth: 220 }}>{r.error}</div>}
                  </td>
                  <td style={td}>{r.summary?.carrierCalls ?? '—'}</td>
                  <td style={td}>{r.summary?.matched ?? '—'}</td>
                  <td style={td}>
                    {r.summary
                      ? DRIFT(r.summary) === 0
                        ? <Pill tone="ok">clean</Pill>
                        : <Pill tone="err">{DRIFT(r.summary)}</Pill>
                      : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {r.summary && DRIFT(r.summary) > 0 && (
                      <button style={btn()} onClick={() => open(r.id)}>Details</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>
              {when(detail.windowStart)} → {when(detail.windowEnd)}
            </strong>
            <button style={btn()} onClick={() => setDetail(null)}>Close</button>
          </div>
          {detail.summary && (
            <div style={{ fontSize: 12.5, color: 'var(--tx-2)', marginBottom: 12 }}>
              {detail.summary.carrierOnly} billed by Plivo with no call of ours ·{' '}
              {detail.summary.oursOnly} of ours Plivo has no record of ·{' '}
              {detail.summary.durationMismatch} disagree on duration ·{' '}
              {detail.summary.unbilled} the wallet never paid for
              {detail.summary.accountErrors?.length ? (
                <div style={{ color: 'var(--err)', marginTop: 6 }}>
                  {detail.summary.accountErrors.length} account(s) could not be read — the findings are incomplete.
                </div>
              ) : null}
            </div>
          )}
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={th}>Kind</th>
                  <th style={th}>Workspace</th>
                  <th style={th}>Carrier call</th>
                  <th style={th}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {(detail.discrepancies ?? []).map((d, i) => (
                  <tr key={i}>
                    <td style={td}><Pill tone="warn">{String(d.kind).replace(/_/g, ' ')}</Pill></td>
                    <td style={{ ...td, fontSize: 12.5 }}>{String(d.workspaceId ?? '—')}</td>
                    <td style={{ ...td, ...mono, fontSize: 11 }}>{String(d.callUuid ?? d.providerCallId ?? '—')}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {d.kind === 'duration_mismatch' && `carrier ${d.carrierBillSec}s vs ours ${d.ourDurationSec}s`}
                      {d.kind === 'carrier_only' && `${d.from} → ${d.to}, ${d.carrierBillSec}s, ${d.carrierAmount}`}
                      {d.kind === 'ours_only' && `${d.number}, ${d.ourDurationSec}s, billed ${rupees(Number(d.ourBilledCents))}`}
                      {d.kind === 'unbilled' && `carrier billed ${d.carrierBillSec}s, wallet charged nothing`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Limits ────────────────────────────────────────────────────────────── */

function LimitsTab({ onChanged }: { onChanged: () => void }) {
  const [ceiling, setCeiling] = useState('');
  const [perWorkspace, setPerWorkspace] = useState('');
  const [live, setLive] = useState<{ carrierCeiling: number; perWorkspace: number; active: number; safetyBuffer: number; byWorkspace: Record<string, number> } | null>(null);

  const load = useCallback(() => {
    adminFetch<typeof live>('/telephony/concurrency').then(r => {
      setLive(r);
      setCeiling(String(r!.carrierCeiling));
      setPerWorkspace(String(r!.perWorkspace));
    }).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const { busy, error, notice, run } = useAction(() => { load(); onChanged(); });

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 12.5, color: 'var(--tx-3)', margin: '0 0 14px' }}>
        Every subaccount shares our main account's concurrency pool at Plivo — there is no per-subaccount
        cap and no per-subaccount usage API, so the per-workspace ceiling here is the only thing standing
        between one client's campaign and everyone else's calls. Past the carrier's own ceiling calls fail
        instantly with 5030, with no queuing.
      </p>

      {error && <Banner tone="err">{error}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      {live && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>{live.active}</strong> calls live now, out of a usable{' '}
            <strong>{live.carrierCeiling - live.safetyBuffer}</strong>{' '}
            <span style={{ color: 'var(--tx-3)' }}>({live.carrierCeiling} at the carrier, {live.safetyBuffer} held back for inbound and test calls)</span>
          </div>
          {Object.entries(live.byWorkspace ?? {}).length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--tx-2)' }}>
              {Object.entries(live.byWorkspace).map(([ws, n]) => `${ws}: ${n}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, display: 'grid', gap: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tx-2)' }}>
          Carrier ceiling
          <input
            type="number" min="1" style={{ ...input, marginTop: 6, width: 140, fontSize: 18, padding: '9px 11px' }}
            value={ceiling} onChange={e => setCeiling(e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 4, fontWeight: 400 }}>
            What Plivo actually allows this account — India defaults to 50. Raising it here does not raise
            it at the carrier; it has to be approved on the account first, or the only thing that changes
            is which side rejects the call.
          </div>
        </label>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tx-2)' }}>
          Per-workspace ceiling
          <input
            type="number" min="0" style={{ ...input, marginTop: 6, width: 140, fontSize: 18, padding: '9px 11px' }}
            value={perWorkspace} onChange={e => setPerWorkspace(e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 4, fontWeight: 400 }}>
            0 leaves clients uncapped — one campaign can then take the whole pool. A campaign that hits its
            own ceiling waits and retries rather than failing.
          </div>
        </label>

        <div>
          <button
            style={btn('primary')}
            disabled={busy === 'save'}
            onClick={() => void run(
              'save',
              () => adminFetch('/telephony/concurrency', {
                method: 'PUT',
                body: JSON.stringify({ carrierCeiling: Number(ceiling), perWorkspace: Number(perWorkspace) }),
              }),
              'Limits saved. They apply to the next call placed.',
            )}
          >
            <Gauge size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
            {busy === 'save' ? 'Saving…' : 'Save limits'}
          </button>
        </div>
      </div>
    </div>
  );
}
