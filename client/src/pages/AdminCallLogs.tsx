import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneCall, ChevronLeft, ChevronRight, Search, X, Mic, AlertCircle,
  RefreshCw, Clock, TrendingUp, CircleAlert,
} from 'lucide-react';
import { adminFetch, qs } from '@/lib/adminApi';
import { safeGet } from '@/lib/authStorage';
import { AdminPageHeader } from './AdminPanel';

interface CallRow {
  id: string;
  type: string;
  status: string;
  durationSec: number;
  phoneNumber: string | null;
  startedAt: string;
  endedAt: string | null;
  hasRecording: boolean;
  extractionStatus: string;
  billingStatus: string;
  billedCents: number;
  billedMinutes: number;
  ratePerMinuteCents: number | null;
  actualCostMicroUsd: number | null;
  agent: { id: string; name: string; aiModel: string; voice: string } | null;
  workspace: { id: string; name: string; slug: string; planName: string } | null;
}

interface CallDetail extends CallRow {
  transcript: { role: string; content: string }[];
  extractedData: Record<string, any>;
  extractionError: string | null;
  recordingMime: string | null;
}

interface Stats {
  totalCalls: number;
  totalMinutes: number;
  avgDurationSec: number;
  revenueCents: number;
  recordedCalls: number;
  failureRatePct: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  cogs: { measuredCalls: number; totalMicroUsd: number; coveragePct: number };
  topWorkspaces: { workspace: { name: string; planName: string } | null; calls: number; minutes: number; revenueCents: number }[];
}

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'var(--cyan-fg)', FAILED: 'var(--err)', INITIATED: 'var(--warn)', IN_PROGRESS: 'var(--cyan-fg)',
};

const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** A call that never connected has no duration — "0:00" reads like a measurement. */
const fmtDurationCell = (s: number) => (s > 0 ? fmtDuration(s) : '—');
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtMoney = (cents: number) => `₹${(cents / 100).toFixed(2)}`;

/**
 * The Billed column used to print the raw enum, so a call that will never be
 * charged read as "pending" — indistinguishable from money genuinely still owed.
 * These say what each state actually means to the operator.
 */
const BILLING_LABEL: Record<string, { text: string; color?: string }> = {
  SKIPPED: { text: 'not billable' },
  PENDING: { text: 'awaiting billing', color: 'var(--warn)' },
  FAILED: { text: 'billing failed', color: 'var(--err)' },
};

export default function AdminCallLogs() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [hasRecording, setHasRecording] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = { page, limit: 25, status, type, workspaceId, hasRecording, search };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'call-logs', filters],
    queryFn: () => adminFetch<{ logs: CallRow[]; total: number; page: number; pages: number }>(`/call-logs${qs(filters)}`),
  });

  const {
    data: stats, isError: statsFailed, error: statsError, refetch: refetchStats,
  } = useQuery({
    queryKey: ['admin', 'call-stats'],
    queryFn: () => adminFetch<Stats>('/call-logs/stats?days=90'),
  });

  const { data: options } = useQuery({
    queryKey: ['admin', 'call-options'],
    queryFn: () => adminFetch<{ workspaces: { id: string; name: string }[] }>('/call-logs/options'),
    staleTime: 300_000,
  });

  const logs = data?.logs ?? [];
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };

  return (
    <>
      <AdminPageHeader
        title="Call Logs"
        subtitle="Every call across every tenant — transcripts, recordings and extracted data"
        icon={<PhoneCall size={21} />}
      />

      {/*
        A failed stats query previously rendered NOTHING — the whole band just
        vanished, so a transient database blip looked identical to "this
        platform has no calls". Silent absence is the worst failure mode for a
        number an operator is about to make a decision on.
      */}
      {statsFailed && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '11px 14px', marginBottom: 16, borderRadius: 9,
          border: '1px solid rgba(239,68,68,0.32)', background: 'rgba(239,68,68,0.07)',
          color: 'var(--err)', fontSize: 12.5, flexWrap: 'wrap',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} />
            Call statistics could not be loaded — {(statsError as Error)?.message ?? 'unknown error'}.
            The call list below is unaffected.
          </span>
          <button onClick={() => refetchStats()} style={{ ...btnStyle, color: 'var(--err)', borderColor: 'rgba(239,68,68,0.32)' }}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {stats && (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 14 }}>
            <Stat label="Calls (90d)" value={stats.totalCalls} icon={<PhoneCall size={15} />} color="var(--cyan-fg)" />
            <Stat label="Total minutes" value={stats.totalMinutes} icon={<Clock size={15} />} color="var(--violet)" />
            <Stat label="Avg duration" value={fmtDuration(stats.avgDurationSec)} icon={<Clock size={15} />} color="var(--cyan-fg)" />
            <Stat label="Failure rate" value={`${stats.failureRatePct}%`} icon={<CircleAlert size={15} />} color={stats.failureRatePct > 10 ? 'var(--err)' : 'var(--warn)'} />
            <Stat label="Revenue (90d)" value={fmtMoney(stats.revenueCents)} icon={<TrendingUp size={15} />} color="var(--cyan-fg)" />
          </div>

          {/*
            Margin is deliberately NOT shown as a number. AgentCallLog.actualCostMicroUsd
            is null on every call because settleCall() is never given a cost, so any
            margin would be computed against zero COGS and render as 100% profit.
          */}
          {stats.cogs.coveragePct === 0 && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', marginBottom: 16,
              borderRadius: 9, border: '1px solid rgba(245,158,11,0.32)', background: 'rgba(245,158,11,0.07)',
              color: 'var(--warn)', fontSize: 12.5, lineHeight: 1.5,
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Margin is not reportable yet.</strong> Provider cost (<code>actualCostMicroUsd</code>) is
                recorded on 0 of {stats.totalCalls} calls — <code>settleCall()</code> accepts a cost but no
                caller supplies one. Cost-per-call and margin stay unavailable until the call pipeline
                measures and passes it.
              </span>
            </div>
          )}
        </>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
          style={{ position: 'relative', flex: '1 1 200px', minWidth: 170 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-2)' }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Phone number…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--s1)', color: 'var(--tx)', fontSize: 13,
            }}
          />
        </form>
        <Select value={workspaceId} onChange={reset(setWorkspaceId)} options={[
          { v: '', l: 'All workspaces' },
          ...(options?.workspaces ?? []).map((w) => ({ v: w.id, l: w.name })),
        ]} />
        <Select value={status} onChange={reset(setStatus)} options={[
          { v: '', l: 'All statuses' }, { v: 'COMPLETED', l: 'Completed' },
          { v: 'FAILED', l: 'Failed' }, { v: 'INITIATED', l: 'Initiated' }, { v: 'IN_PROGRESS', l: 'In progress' },
        ]} />
        <Select value={type} onChange={reset(setType)} options={[
          { v: '', l: 'All types' }, { v: 'WEB_CALL', l: 'Web call' },
          { v: 'PHONE_CALL', l: 'Phone call' }, { v: 'CHAT', l: 'Chat' },
        ]} />
        <Select value={hasRecording} onChange={reset(setHasRecording)} options={[
          { v: '', l: 'Any recording' }, { v: 'true', l: 'Has recording' }, { v: 'false', l: 'No recording' },
        ]} />
        <button onClick={() => refetch()} style={btnStyle}>
          <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : undefined }} /> Refresh
        </button>
      </div>

      {isError && <Notice tone="error"><AlertCircle size={15} /> {(error as Error)?.message}</Notice>}
      {isLoading && <Notice>Loading calls…</Notice>}
      {!isLoading && !isError && logs.length === 0 && <Notice>No calls match these filters.</Notice>}

      {logs.length > 0 && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--s1)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'var(--bg-2)' }}>
                  {['Started', 'Workspace', 'Agent', 'Type', 'Duration', 'Status', 'Billed', ''].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((c) => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)}
                    style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                    <td style={tdStyle}>{fmtDate(c.startedAt)}</td>
                    <td style={tdStyle}>
                      <div style={{ color: 'var(--tx)' }}>{c.workspace?.name ?? '—'}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: 'var(--tx)' }}>{c.agent?.name ?? '(deleted)'}</div>
                      {c.agent && <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>{c.agent.aiModel}</div>}
                    </td>
                    <td style={tdStyle}>{c.type.replace('_', ' ').toLowerCase()}</td>
                    <td style={tdStyle}>
                      {fmtDurationCell(c.durationSec)}
                      {c.hasRecording && <Mic size={12} style={{ marginLeft: 6, color: 'var(--cyan-fg)', verticalAlign: -1 }} />}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[c.status] ?? 'var(--tx-2)' }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {c.billingStatus === 'BILLED' ? fmtMoney(c.billedCents) : (() => {
                        const l = BILLING_LABEL[c.billingStatus] ?? { text: c.billingStatus.toLowerCase() };
                        return <span style={{ color: l.color ?? 'var(--tx-2)', fontSize: 12 }}>{l.text}</span>;
                      })()}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--tx-2)', fontSize: 11 }}>view</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>
              {data!.total} calls · page {data!.page} of {Math.max(data!.pages, 1)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <PageBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Prev</PageBtn>
              <PageBtn disabled={page >= (data!.pages || 1)} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={14} /></PageBtn>
            </div>
          </div>
        </div>
      )}

      {openId && <CallDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** Slide-over with transcript, recording player and extracted data. */
function CallDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'call-log', id],
    queryFn: () => adminFetch<CallDetail>(`/call-logs/${id}`),
  });

  // An <audio src> cannot send an Authorization header, and this API refuses
  // query-string tokens by design (see authenticate.js: they leak through
  // logs, proxies and browser history). So the recording is fetched WITH the
  // header and handed to the player as an object URL. Costs one buffered load
  // — recordings are a couple of megabytes — and keeps the token out of the
  // URL entirely.
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.hasRecording) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/v1/admin/call-logs/${id}/recording`, {
          headers: { Authorization: `Bearer ${safeGet('token')}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Recording unavailable (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setRecordingUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setRecordingError((e as Error).message);
      }
    })();

    // Revoke on unmount, or every opened call leaks a few MB for the session.
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, data?.hasRecording]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(620px, 100%)', height: '100%', background: 'var(--s1)',
        borderLeft: '1px solid var(--line)', overflowY: 'auto', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--tx)' }}>Call detail</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--tx-2)', cursor: 'pointer' }}>
            <X size={19} />
          </button>
        </div>

        {isLoading && <Notice>Loading…</Notice>}
        {isError && <Notice tone="error"><AlertCircle size={15} /> {(error as Error)?.message}</Notice>}

        {data && (
          <>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginBottom: 18, fontSize: 12.5 }}>
              <Field label="Workspace" value={data.workspace?.name ?? '—'} />
              <Field label="Agent" value={data.agent?.name ?? '(deleted)'} />
              <Field label="Type" value={data.type} />
              <Field label="Status" value={data.status} color={STATUS_COLOR[data.status]} />
              <Field label="Duration" value={fmtDurationCell(data.durationSec)} />
              <Field label="Started" value={fmtDate(data.startedAt)} />
              <Field
                label="Billing"
                value={data.billingStatus === 'BILLED'
                  ? `billed · ${fmtMoney(data.billedCents)}`
                  : BILLING_LABEL[data.billingStatus]?.text ?? data.billingStatus.toLowerCase()}
                color={BILLING_LABEL[data.billingStatus]?.color}
              />
              <Field label="Provider cost" value={data.actualCostMicroUsd === null ? 'not measured' : `$${(data.actualCostMicroUsd / 1e6).toFixed(4)}`} />
            </div>

            {data.hasRecording && (
              <Section title="Recording">
                {recordingError && <Muted>{recordingError}</Muted>}
                {!recordingError && !recordingUrl && <Muted>Loading recording…</Muted>}
                {recordingUrl && (
                  <>
                    <audio controls src={recordingUrl} style={{ width: '100%' }} />
                    {/*
                      MediaRecorder writes WebM without a Duration element (it is
                      recording a live stream and cannot know the length up front),
                      so the browser reports duration NaN and the scrubber reads
                      0:00 however complete the file is. The audio itself decodes
                      fine. Showing the recorded length from the database means the
                      operator still knows how long the call was.
                    */}
                    <Muted>
                      Recorded length {fmtDuration(data.durationSec)} — the player&apos;s timer stays at 0:00
                      because streamed WebM carries no duration header.
                    </Muted>
                  </>
                )}
              </Section>
            )}

            <Section title={`Transcript (${data.transcript.length} turns)`}>
              {data.transcript.length === 0
                ? <Muted>No transcript recorded.</Muted>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                    {data.transcript.map((t, i) => (
                      <div key={i} style={{
                        padding: '8px 11px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
                        background: t.role === 'assistant' ? 'rgba(14,179,158,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${t.role === 'assistant' ? 'rgba(14,179,158,0.18)' : 'var(--line)'}`,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 3, color: t.role === 'assistant' ? 'var(--cyan-fg)' : 'var(--tx-2)' }}>
                          {t.role}
                        </div>
                        <div style={{ color: 'var(--tx)' }}>{t.content}</div>
                      </div>
                    ))}
                  </div>
                )}
            </Section>

            <Section title={`Extracted data (${data.extractionStatus.toLowerCase()})`}>
              {data.extractionError && <Muted>Error: {data.extractionError}</Muted>}
              <pre style={{
                margin: 0, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--line)', fontSize: 11.5, color: 'var(--tx)',
                overflowX: 'auto', maxHeight: 240,
              }}>
                {JSON.stringify(data.extractedData, null, 2)}
              </pre>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── small presentational helpers ────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '11px 14px', fontFamily: 'var(--ff-m)', fontSize: 10.5, fontWeight: 500, letterSpacing: '1px',
  color: 'var(--tx-3)', textTransform: 'uppercase',
  borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '10px 14px', color: 'var(--tx-2)', whiteSpace: 'nowrap' };
const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--s1)', color: 'var(--tx-2)',
  fontSize: 13, cursor: 'pointer',
};

function Stat({ label, value, icon, color }: { label: string; value: React.ReactNode; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderTop: `2px solid ${color}`, borderRadius: 10, padding: '13px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, color: 'var(--tx-2)', fontWeight: 600 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--tx)' }}>{value}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)',
      background: 'var(--s1)', color: 'var(--tx)', fontSize: 13, cursor: 'pointer', maxWidth: 190,
    }}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7,
      border: '1px solid var(--line)', background: 'transparent', fontSize: 12,
      color: disabled ? 'var(--tx-2)' : 'var(--tx)',
      opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--tx-2)', marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ color: color ?? 'var(--tx)', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: 'var(--tx-2)', marginBottom: 6 }}>{children}</div>;
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderRadius: 10,
      border: `1px solid ${tone === 'error' ? 'rgba(239,68,68,0.35)' : 'var(--line)'}`,
      background: tone === 'error' ? 'rgba(239,68,68,0.08)' : 'var(--s1)',
      color: tone === 'error' ? 'var(--err)' : 'var(--tx-2)', fontSize: 13.5,
    }}>{children}</div>
  );
}
