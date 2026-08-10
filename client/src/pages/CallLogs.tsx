import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { whapi } from '../lib/whapi';
import { RzEmpty, RzPill, RzSearch, RzSkeleton, type Tone } from '@/components/rz';

/**
 * Calls — the list/detail split from Spandan Calls.dc.html.
 *
 * This page used to be a static mock: hard-coded filter selects that filtered
 * nothing, a ten-column header, and a permanent "No records found" body. It now
 * reads the same `/analytics/calls/logs` endpoint the Analytics page does, and
 * lays the result out the way the design does — a scanning column on the left,
 * one call opened beside it.
 */

interface CallLog {
  id: string;
  assistant: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  duration: number;
  durationFormatted: string;
  cost: number;
  sentiment: string | null;
  outcome: string | null;
  startedAt: string;
  endedAt: string | null;
  recordingUrl: string | null;
  transcript: string | null;
}

type Pagination = { page: number; totalPages: number; total: number; hasNext: boolean; hasPrev: boolean };

const statusTone = (status: string): Tone => {
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'resolved') return 'ok';
  if (s === 'failed' || s === 'error') return 'err';
  if (s === 'busy' || s === 'no-answer' || s === 'voicemail') return 'warn';
  if (s === 'transferred') return 'speak';
  return 'idle';
};

const sentimentTone = (s: string | null): Tone =>
  s === 'positive' ? 'ok' : s === 'negative' ? 'err' : 'idle';

/** "3m", "2h", "4d" — the age column in the design's list rows. */
const ago = (iso: string) => {
  if (!iso) return '—';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};

const FILTERS = [
  { value: '',            label: 'All' },
  { value: 'completed',   label: 'Completed' },
  { value: 'failed',      label: 'Failed' },
  { value: 'no-answer',   label: 'No answer' },
] as const;

export default function CallLogs() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ range, page: String(page), limit: '30' });
      if (status) p.set('status', status);
      if (search.trim()) p.set('search', search.trim());
      const res = await whapi.get<any>(`/analytics/calls/logs?${p.toString()}`);
      if (res?.success) {
        setCalls(res.data.data ?? []);
        setPagination(res.data.pagination ?? null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load calls');
    } finally {
      setLoading(false);
    }
  }, [range, page, status, search]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  // Keep a selection alive across refetches; fall back to the newest call.
  useEffect(() => {
    if (!calls.length) { setSelectedId(null); return; }
    if (!selectedId || !calls.some(c => c.id === selectedId)) setSelectedId(calls[0].id);
  }, [calls, selectedId]);

  const selected = useMemo(() => calls.find(c => c.id === selectedId) ?? null, [calls, selectedId]);

  const exportCsv = () => {
    const head = ['Started', 'Agent', 'From', 'To', 'Direction', 'Status', 'Duration', 'Cost', 'Sentiment', 'Outcome'];
    const rows = calls.map(c => [
      c.startedAt, c.assistant, c.from, c.to, c.direction, c.status,
      c.durationFormatted, c.cost ?? 0, c.sentiment ?? '', c.outcome ?? '',
    ]);
    const csv = [head, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `spandan-calls-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rz-page rz-fill">
      {/* Toolbar */}
      <div
        className="rz-between"
        style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', flexWrap: 'wrap', gap: 12 }}
      >
        <div className="rz-cluster-sm">
          {FILTERS.map(f => (
            <button
              key={f.label}
              className={`rz-chip ${status === f.value ? 'is-active' : ''}`}
              onClick={() => { setStatus(f.value); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="rz-cluster-sm">
          <RzSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search number or transcript…" style={{ width: 260 }} />
          <select className="rz-select" style={{ width: 'auto' }} value={range} onChange={e => { setRange(e.target.value as any); setPage(1); }}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button className="rz-btn rz-btn-secondary" onClick={exportCsv} disabled={!calls.length}>Export CSV</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.08)', color: 'var(--err)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="rz-split" style={{ flex: 1, minHeight: 0 }}>
        {/* ── List ── */}
        <div className="rz-split-list">
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && !calls.length ? (
              <div style={{ padding: 16 }}><RzSkeleton rows={6} height={54} /></div>
            ) : !calls.length ? (
              <RzEmpty
                title="No calls yet"
                text="Calls appear here as soon as an agent picks up. Widen the date range if you expected to see history."
              />
            ) : (
              calls.map(c => (
                <button
                  key={c.id}
                  className={`rz-row ${c.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="rz-cluster-sm" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                    <span className={`rz-mark ${c.direction === 'INBOUND' ? '' : 'rz-mark-violet'}`} style={{ width: 30, height: 30, borderRadius: 8 }}>
                      {c.direction === 'INBOUND' ? '↙' : '↗'}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="rz-truncate" style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--tx)' }}>{c.assistant}</div>
                      <div className="rz-mono-xs rz-truncate">{c.direction === 'INBOUND' ? c.from : c.to}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <RzPill tone={statusTone(c.status)}>{c.outcome || c.status}</RzPill>
                    <div className="rz-mono-xs" style={{ marginTop: 4 }}>{c.durationFormatted} · {ago(c.startedAt)}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="rz-between" style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
              <button className="rz-btn rz-btn-ghost rz-btn-sm" disabled={!pagination.hasPrev} onClick={() => setPage(p => p - 1)}>←</button>
              <span className="rz-mono">{pagination.page} / {pagination.totalPages} · {pagination.total} calls</span>
              <button className="rz-btn rz-btn-ghost rz-btn-sm" disabled={!pagination.hasNext} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </div>

        {/* ── Detail ── */}
        <div className="rz-split-detail">
          {!selected ? (
            <RzEmpty
              title="Select a call"
              text="Pick a call from the list to hear the recording and read what was said."
            />
          ) : (
            <>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)' }}>
                <div className="rz-between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="rz-cluster-sm">
                      <div className="rz-h3">{selected.assistant}</div>
                      <RzPill tone={statusTone(selected.status)}>{selected.outcome || selected.status}</RzPill>
                    </div>
                    <div className="rz-mono" style={{ marginTop: 4 }}>
                      {selected.from} → {selected.to} ·{' '}
                      {selected.startedAt ? format(parseISO(selected.startedAt), 'MMM dd, yyyy · HH:mm') : '—'}
                    </div>
                  </div>
                </div>

                {/* Player. Native controls — a custom transport would be a
                    second, worse audio element for no gain here. */}
                <div className="rz-card" style={{ marginTop: 16, padding: 14 }}>
                  {selected.recordingUrl ? (
                    <audio
                      ref={audioRef}
                      key={selected.id}
                      src={selected.recordingUrl}
                      controls
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <div className="rz-mono" style={{ textAlign: 'center', padding: '10px 0' }}>
                      No recording stored for this call
                    </div>
                  )}
                </div>
              </div>

              {/* Transcript + insight rail */}
              <div className="sp-detail-body" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 280px', overflow: 'hidden' }}>
                <div style={{ overflowY: 'auto', padding: '20px 22px' }}>
                  <div className="rz-label" style={{ marginBottom: 10 }}>Transcript</div>
                  {selected.transcript ? (
                    <p style={{ fontSize: 13.5, color: 'var(--tx-2)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>
                      {selected.transcript}
                    </p>
                  ) : (
                    <p className="rz-mono" style={{ margin: 0 }}>No transcript available for this call.</p>
                  )}
                </div>

                <div style={{ borderLeft: '1px solid var(--line)', overflowY: 'auto', padding: 18, background: 'var(--bg-2)' }}>
                  <div className="rz-label">Extracted</div>
                  <div className="rz-stack-sm" style={{ margin: '10px 0 18px' }}>
                    {[
                      ['Direction', selected.direction?.toLowerCase()],
                      ['Duration', selected.durationFormatted],
                      ['Cost', `$${selected.cost?.toFixed(2) ?? '0.00'}`],
                      ['Status', selected.status],
                      ['Ended', selected.endedAt ? format(parseISO(selected.endedAt), 'HH:mm') : '—'],
                    ].map(([k, v]) => (
                      <div key={k as string} className="rz-between" style={{ fontSize: 12.5 }}>
                        <span className="rz-muted">{k}</span>
                        <span style={{ fontWeight: 600, textAlign: 'right', color: 'var(--tx)' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rz-label" style={{ marginBottom: 8 }}>Sentiment</div>
                  {selected.sentiment ? (
                    <RzPill tone={sentimentTone(selected.sentiment)}>{selected.sentiment}</RzPill>
                  ) : (
                    <span className="rz-mono">Not scored</span>
                  )}

                  {selected.recordingUrl && (
                    <>
                      <div className="rz-label" style={{ margin: '18px 0 8px' }}>Recording</div>
                      <a
                        className="rz-btn rz-btn-secondary rz-btn-sm rz-btn-block"
                        href={selected.recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download audio
                      </a>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* The insight rail folds under the transcript before the split itself
          collapses — 280px of key/value beside a 300px transcript is unreadable
          long before the viewport gets narrow enough to stack the whole page. */}
      <style>{`
        @media (max-width: 1180px) {
          .sp-detail-body { grid-template-columns: 1fr !important; }
          .sp-detail-body > div:last-child {
            border-left: none !important;
            border-top: 1px solid var(--line) !important;
          }
        }
      `}</style>
    </div>
  );
}
