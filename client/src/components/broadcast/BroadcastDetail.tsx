/**
 * One broadcast, in detail: how far it has got, who it reached, what it cost.
 *
 * The outcome breakdown is the point of this view. A broadcast's headline
 * progress number says how many dials are finished, which is not the question
 * anyone actually has — "did people hear it, and what did that cost" is — so
 * answered / no-answer / failed are shown side by side with the money, and the
 * per-recipient table underneath is where a disputed charge gets settled.
 */
import { useEffect, useState } from 'react';
import {
  getBroadcastStats, listRecipients, rupees, mmss,
  type BroadcastStats, type BroadcastRecipient,
} from '@/lib/broadcastApi';

const OUTCOME_LABEL: Record<string, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  failed: 'Failed',
  skipped: 'Skipped',
  calling: 'Ringing',
  pending: 'Queued',
};

const OUTCOME_COLOR: Record<string, string> = {
  answered: 'var(--lime)',
  no_answer: 'var(--tx-3)',
  failed: 'var(--err)',
  skipped: 'var(--coral)',
  calling: 'var(--cyan-fg)',
  pending: 'var(--tx-3)',
};

export default function BroadcastDetail({ broadcastId, onClose }: { broadcastId: string; onClose: () => void }) {
  const [stats, setStats] = useState<BroadcastStats | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [s, r] = await Promise.all([
        getBroadcastStats(broadcastId),
        listRecipients(broadcastId, filter || undefined),
      ]);
      setStats(s);
      setRecipients(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this broadcast');
    }
  };

  useEffect(() => { load(); }, [broadcastId, filter]);

  // A running broadcast's outcomes arrive asynchronously from the carrier, so
  // the view has to move on its own — otherwise it looks stalled at the moment
  // it is doing the most work.
  const live = stats?.broadcast.status === 'RUNNING';
  useEffect(() => {
    if (!live) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [live, filter, broadcastId]);

  const b = stats?.broadcast;
  const count = (s: string) => stats?.breakdown.find((r) => r.status === s)?._count.status ?? 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50,
      display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: '760px', background: 'var(--s1)', borderLeft: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', height: '100%' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px' }}>{b?.name ?? 'Broadcast'}</h2>
            <div className="rz-mono" style={{ fontSize: '11.5px', color: 'var(--tx-3)', marginTop: '5px' }}>
              {b?.recording?.name} · {mmss((b?.recording?.durationSec ?? 0) * (b?.repeatCount ?? 1))} per call ·{' '}
              {(b?.fromNumbers ?? []).join(', ') || b?.fromNumber}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'grid', gap: '20px', alignContent: 'start' }}>
          {error && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: '13px' }}>{error}</div>
          )}

          {b?.lastError && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(250,204,21,0.10)',
              border: '1px solid rgba(250,204,21,0.35)', color: 'var(--tx)', fontSize: '12.5px' }}>
              {b.lastError}
            </div>
          )}

          {/* Outcomes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            <Tile label="Reached" value={count('answered').toLocaleString('en-IN')} accent="var(--lime)" />
            <Tile label="No answer" value={count('no_answer').toLocaleString('en-IN')} />
            <Tile label="Failed" value={count('failed').toLocaleString('en-IN')} accent="var(--err)" />
            <Tile label="Left to dial" value={(count('pending') + count('calling')).toLocaleString('en-IN')} />
            <Tile label="Spent" value={rupees(stats?.billing.billedCents ?? 0)} accent="var(--cyan-fg)" />
          </div>

          {stats && (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
              {stats.billing.billedCalls.toLocaleString('en-IN')} charged calls ·{' '}
              {mmss(stats.billing.billedSeconds)} of audio delivered. Unanswered dials are not
              charged, because the carrier does not charge us for them either.
            </p>
          )}

          {/* Recipients */}
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {['', 'answered', 'no_answer', 'failed', 'skipped'].map((s) => (
                <button key={s || 'all'}
                  className={`rz-btn rz-btn-sm ${filter === s ? 'rz-btn-primary' : 'rz-btn-secondary'}`}
                  onClick={() => setFilter(s)}>
                  {s ? OUTCOME_LABEL[s] : 'All'}
                </button>
              ))}
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)', color: 'var(--tx-3)' }}>
                    <th style={th}>Number</th>
                    <th style={th}>Outcome</th>
                    <th style={th}>Heard</th>
                    <th style={th}>Charged</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.length === 0 ? (
                    <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--tx-3)', padding: '24px' }}>
                      Nothing here yet.
                    </td></tr>
                  ) : recipients.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={td}>
                        <span className="rz-mono">{r.phoneNumber}</span>
                        {r.contact?.name && (
                          <div style={{ color: 'var(--tx-3)', fontSize: '11.5px' }}>{r.contact.name}</div>
                        )}
                      </td>
                      <td style={{ ...td, color: OUTCOME_COLOR[r.status] ?? 'var(--tx-2)' }}>
                        {OUTCOME_LABEL[r.status] ?? r.status}
                        {r.failureReason && (
                          <div style={{ color: 'var(--tx-3)', fontSize: '11px' }}>{r.failureReason}</div>
                        )}
                      </td>
                      <td style={td}>{r.durationSec ? mmss(r.durationSec) : '—'}</td>
                      <td style={td}>{r.billedCents ? rupees(r.billedCents) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--ff-m)', fontSize: '10.5px',
  letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500,
};
const td: React.CSSProperties = { padding: '10px 14px', color: 'var(--tx-2)', verticalAlign: 'top' };

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: '12px', background: 'var(--s2)', padding: '12px 14px' }}>
      <div style={{ fontSize: '11px', color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '5px', color: accent ?? 'var(--tx)' }}>{value}</div>
    </div>
  );
}
