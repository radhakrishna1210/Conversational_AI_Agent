/**
 * Voice Broadcast — one-way recorded calls.
 *
 * Sits deliberately next to Bulk Call and shares its address book: the same
 * clusters, the same contacts, the same opt-outs. The difference is what happens
 * when someone picks up. A bulk call hands them an agent; a broadcast plays a
 * recording and hangs up, which is why it costs a carrier minute and nothing
 * else — no speech recognition, no model, no speech synthesis per call.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWorkspaceId } from '@/lib/authStorage';
import {
  listBroadcasts, startBroadcast, pauseBroadcast, cancelBroadcast,
  syncBroadcastList, deleteBroadcast, getBroadcastRate, rupees, mmss,
  type Broadcast,
} from '@/lib/broadcastApi';
import BroadcastWizard from '@/components/broadcast/BroadcastWizard';
import BroadcastDetail from '@/components/broadcast/BroadcastDetail';
import RecordingStudio from '@/components/broadcast/RecordingStudio';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  RUNNING:   { bg: 'rgba(14,179,158,0.14)',  color: 'var(--cyan-fg)' },
  COMPLETED: { bg: 'rgba(34,197,94,0.14)',   color: 'var(--lime)' },
  DRAFT:     { bg: 'rgba(148,163,184,0.14)', color: 'var(--tx-2)' },
  SCHEDULED: { bg: 'rgba(99,102,241,0.14)',  color: 'var(--cyan-fg)' },
  PAUSED:    { bg: 'rgba(250,204,21,0.14)',  color: 'var(--warn)' },
  FAILED:    { bg: 'rgba(248,113,113,0.14)', color: 'var(--err)' },
  CANCELLED: { bg: 'rgba(251,146,60,0.14)',  color: 'var(--coral)' },
};

const STARTABLE = new Set(['DRAFT', 'SCHEDULED', 'PAUSED', 'FAILED']);

const thStyle: React.CSSProperties = {
  padding: '11px 16px', textAlign: 'left', fontFamily: 'var(--ff-m)', fontSize: '10.5px',
  letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500,
  color: 'var(--tx-3)', background: 'var(--bg-2)', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '13px 16px', fontSize: '13px', color: 'var(--tx-2)', verticalAlign: 'middle',
};

export default function BroadcastPage() {
  const [tab, setTab] = useState<'broadcasts' | 'recordings'>('broadcasts');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const workspaceId = useMemo(() => getWorkspaceId(), []);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setBroadcasts(await listBroadcasts());
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Could not load broadcasts');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (!workspaceId) { setError('Your session is missing workspace context. Please sign in again.'); setLoading(false); return; }
    load();
    getBroadcastRate().then((r) => setRate(r.perMinuteInr)).catch(() => {});
  }, [workspaceId]);

  // A running broadcast resolves over minutes, and its outcomes arrive from the
  // carrier rather than from anything this page did — so the table has to move
  // on its own or it reads as stalled.
  const hasRunning = broadcasts.some((b) => b.status === 'RUNNING' || b.status === 'SCHEDULED');
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => load(true), 5000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const act = async (id: string, fn: () => Promise<unknown>, message?: string) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (message) setNotice(message);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return broadcasts;
    return broadcasts.filter((b) =>
      b.name.toLowerCase().includes(q) || (b.fromNumber ?? '').toLowerCase().includes(q));
  }, [broadcasts, search]);

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap-wide">
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Operate</div>
            <h1 className="rz-h1">Voice broadcast</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0' }}>
              Play one recording to a whole contact list. One-way: the message plays, the line hangs
              up, nobody can reply. Same lists your <Link to="/bulk_call">bulk calls</Link> dial.
            </p>
          </div>
          <div className="rz-head-actions">
            {rate !== null && (
              <span className="rz-tag" title="Charged per answered call, per minute of audio. Unanswered dials cost nothing.">
                ₹{rate}/min
              </span>
            )}
            <button className="rz-btn rz-btn-primary" onClick={() => setShowWizard(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              New broadcast
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
          {([['broadcasts', 'Broadcasts'], ['recordings', 'Recordings']] as const).map(([key, label]) => (
            <button key={key}
              className={`rz-btn rz-btn-sm ${tab === key ? 'rz-btn-primary' : 'rz-btn-secondary'}`}
              onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px',
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
            color: 'var(--err)', fontSize: '13px' }}>{error}</div>
        )}
        {notice && (
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px',
            background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)',
            color: 'var(--tx)', fontSize: '13px' }}>{notice}</div>
        )}

        {tab === 'recordings' ? (
          <RecordingStudio />
        ) : (
          <>
            <div style={{ marginBottom: '16px', maxWidth: '320px' }}>
              <input className="rz-input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search broadcasts…" />
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden', background: 'var(--s1)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Recording</th>
                      <th style={thStyle}>From</th>
                      <th style={thStyle}>Progress</th>
                      <th style={thStyle}>Reached</th>
                      <th style={thStyle}>Spent</th>
                      <th style={thStyle} />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '36px' }}>Loading…</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '36px' }}>
                        No broadcasts yet. Make a recording, then send it to a list.
                      </td></tr>
                    ) : filtered.map((b) => {
                      const pill = STATUS_STYLES[b.status] ?? STATUS_STYLES.DRAFT;
                      return (
                        <tr key={b.id} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--tx)' }}>
                            <button onClick={() => setDetailId(b.id)}
                              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit',
                                cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                              {b.name}
                            </button>
                            {b.scheduledAt && b.status === 'SCHEDULED' && (
                              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--tx-3)', marginTop: '3px' }}>
                                {new Date(b.scheduledAt).toLocaleString()}
                              </div>
                            )}
                            {b.lastError && (
                              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--err)',
                                marginTop: '3px', maxWidth: '260px' }}>{b.lastError}</div>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px',
                              fontWeight: 600, background: pill.bg, color: pill.color }}>{b.status}</span>
                          </td>
                          <td style={tdStyle}>
                            {b.recording?.name ?? '—'}
                            <div className="rz-mono" style={{ fontSize: '11px', color: 'var(--tx-3)' }}>
                              {mmss((b.recording?.durationSec ?? 0) * b.repeatCount)}
                              {b.repeatCount > 1 ? ` (×${b.repeatCount})` : ''}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, fontFamily: 'var(--ff-m)', fontSize: '12px' }}>
                            {b.fromNumber ?? '—'}
                            {(b.fromNumbers?.length ?? 0) > 1 && (
                              <div style={{ color: 'var(--tx-3)', fontSize: '11px' }}>
                                +{(b.fromNumbers!.length - 1)} more
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, minWidth: '150px' }}>
                            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--line-2)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${b.progress}%`, background: 'var(--cyan)' }} />
                            </div>
                            <div className="rz-mono" style={{ fontSize: '11px', color: 'var(--tx-3)', marginTop: '4px' }}>
                              {b.progress}% of {b.totalRecipients.toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ color: 'var(--lime)', fontWeight: 600 }}>{b.answered.toLocaleString('en-IN')}</span>
                            <span style={{ color: 'var(--tx-3)' }}> / {b.failed.toLocaleString('en-IN')} missed</span>
                          </td>
                          <td style={tdStyle}>{rupees(b.spentCents)}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {STARTABLE.has(b.status) && (
                              <button className="rz-btn rz-btn-primary rz-btn-sm" disabled={busyId === b.id}
                                onClick={() => act(b.id, () => startBroadcast(b.id))}>
                                {b.status === 'PAUSED' ? 'Resume' : 'Start'}
                              </button>
                            )}
                            {(b.status === 'RUNNING' || b.status === 'SCHEDULED') && (
                              <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={busyId === b.id}
                                style={{ marginLeft: '6px' }}
                                onClick={() => act(b.id, () => pauseBroadcast(b.id))}>Pause</button>
                            )}
                            {STARTABLE.has(b.status) && (
                              <button className="rz-btn rz-btn-secondary rz-btn-sm" style={{ marginLeft: '6px' }}
                                disabled={busyId === b.id}
                                title="Add contacts that joined this broadcast's lists since it was created. Numbers already dialled are never repeated."
                                onClick={() => act(b.id, async () => {
                                  const r = await syncBroadcastList(b.id);
                                  setNotice(`${r.added} new contact${r.added === 1 ? '' : 's'} added.`);
                                })}>Sync list</button>
                            )}
                            {(b.status === 'RUNNING' || b.status === 'PAUSED') && (
                              <button className="rz-btn rz-btn-secondary rz-btn-sm" style={{ marginLeft: '6px' }}
                                disabled={busyId === b.id}
                                onClick={() => act(b.id, () => cancelBroadcast(b.id))}>Cancel</button>
                            )}
                            {b.status !== 'RUNNING' && (
                              <button className="rz-btn rz-btn-danger rz-btn-sm" style={{ marginLeft: '6px' }}
                                disabled={busyId === b.id}
                                onClick={() => {
                                  if (!window.confirm(`Delete "${b.name}"? Its delivery report goes with it.`)) return;
                                  act(b.id, () => deleteBroadcast(b.id));
                                }}>Delete</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {showWizard && (
          <BroadcastWizard onClose={() => setShowWizard(false)} onCreated={() => load(true)} />
        )}
        {detailId && <BroadcastDetail broadcastId={detailId} onClose={() => setDetailId(null)} />}
      </div>
    </div>
  );
}
