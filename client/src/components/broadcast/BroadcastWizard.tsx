/**
 * Create a broadcast: recording → audience → caller IDs → review.
 *
 * Four steps rather than one form, because each one can fail in a way the next
 * step depends on, and finding out at "Send" is how ten thousand calls go out
 * wrong. Each step answers its question before the next is offered:
 *
 *   1 what plays        a recording with a real duration — the thing everything
 *                       downstream is priced on
 *   2 who hears it      the deduped, opt-out-removed count, from the server
 *   3 what it dials from whether those caller IDs can broadcast at all
 *   4 what it costs     a range, and an explicit acknowledgement that this is a
 *                       one-way recorded call to real people
 */
import { useEffect, useMemo, useState } from 'react';
import { whapi } from '@/lib/whapi';
import {
  listRecordings, createBroadcast, startBroadcast, launchBroadcast,
  estimateBroadcast, checkCallerReadiness, rupees, mmss,
  type BroadcastRecording, type BroadcastEstimate, type CallerReadiness,
} from '@/lib/broadcastApi';

type Cluster = { id: string; name: string; contactCount: number; dialableCount: number };
type ClusterPreview = {
  clusters: number; rows: number; unique: number; duplicates: number;
  dialable: number; optedOut: number; invalid: number;
};
type NumberOpt = { phoneNumber: string; label: string; source: string };

const STEPS = ['Recording', 'Audience', 'Caller IDs', 'Review'] as const;

export default function BroadcastWizard({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [recordings, setRecordings] = useState<BroadcastRecording[]>([]);
  const [recordingId, setRecordingId] = useState('');
  const [repeatCount, setRepeatCount] = useState(1);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [preview, setPreview] = useState<ClusterPreview | null>(null);

  const [callerNumbers, setCallerNumbers] = useState<NumberOpt[]>([]);
  const [selectedFrom, setSelectedFrom] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<CallerReadiness | null>(null);

  const [estimate, setEstimate] = useState<BroadcastEstimate | null>(null);
  const [schedule, setSchedule] = useState('');
  const [ack, setAck] = useState(false);

  const recording = useMemo(
    () => recordings.find((r) => r.id === recordingId) ?? null,
    [recordings, recordingId],
  );

  useEffect(() => {
    listRecordings().then(setRecordings).catch(() => setRecordings([]));
    whapi.get<Cluster[]>('/clusters').then((r) => setClusters(Array.isArray(r) ? r : [])).catch(() => {});
    whapi.get<{ owned: NumberOpt[]; verified: NumberOpt[] }>('/caller-numbers')
      .then((r) => setCallerNumbers([...(r.owned ?? []), ...(r.verified ?? [])]))
      .catch(() => setCallerNumbers([]));
  }, []);

  // What the selection adds up to once overlapping lists are deduped and
  // opt-outs removed. Asked of the server, because only it knows the overlap.
  useEffect(() => {
    if (!selectedClusters.length) { setPreview(null); return; }
    let cancelled = false;
    const qs = new URLSearchParams({ clusterIds: JSON.stringify(selectedClusters) });
    whapi.get<ClusterPreview>(`/clusters/preview?${qs.toString()}`)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [selectedClusters]);

  // Whether these caller IDs can broadcast at all — not every carrier can play
  // a hosted file. Asked before launch rather than discovered on recipient 4,000.
  useEffect(() => {
    if (!selectedFrom.length) { setReadiness(null); return; }
    let cancelled = false;
    checkCallerReadiness(selectedFrom)
      .then((r) => { if (!cancelled) setReadiness(r); })
      .catch(() => { if (!cancelled) setReadiness(null); });
    return () => { cancelled = true; };
  }, [selectedFrom]);

  useEffect(() => {
    if (!recordingId || !selectedClusters.length) { setEstimate(null); return; }
    let cancelled = false;
    estimateBroadcast({ recordingId, clusterIds: selectedClusters, repeatCount })
      .then((r) => { if (!cancelled) setEstimate(r); })
      .catch(() => { if (!cancelled) setEstimate(null); });
    return () => { cancelled = true; };
  }, [recordingId, selectedClusters, repeatCount]);

  const toggle = (list: string[], value: string) =>
    (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const canContinue = [
    Boolean(name.trim() && recordingId),
    Boolean(selectedClusters.length && preview && preview.dialable > 0),
    Boolean(selectedFrom.length && readiness?.ready),
    ack,
  ][step];

  const submit = async (mode: 'now' | 'schedule') => {
    setSaving(true);
    setError(null);
    try {
      const created = await createBroadcast({
        name: name.trim(),
        recordingId,
        clusterIds: selectedClusters,
        fromNumbers: selectedFrom,
        repeatCount,
      });
      if (mode === 'schedule' && schedule) {
        await launchBroadcast(created.id, new Date(schedule).toISOString());
      } else {
        await startBroadcast(created.id);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create this broadcast');
    } finally {
      setSaving(false);
    }
  };

  const panel: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: '12px',
    background: 'var(--s2)', padding: '12px', maxHeight: '240px', overflowY: 'auto',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: '640px', background: 'var(--s1)', border: '1px solid var(--line)',
        borderRadius: '16px', padding: '22px', display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 48px)' }}>

        {/* Header + step rail */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px' }}>New voice broadcast</h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--tx-2)' }}>
              A one-way call: your recording plays, then the line hangs up. Nobody can reply.
            </p>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '6px', margin: '16px 0 18px' }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ height: '3px', borderRadius: '2px',
                background: i <= step ? 'var(--cyan)' : 'var(--line-2)' }} />
              <div style={{ fontSize: '11px', marginTop: '6px',
                color: i === step ? 'var(--tx)' : 'var(--tx-3)', fontWeight: i === step ? 600 : 400 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '16px', overflowY: 'auto', minHeight: 0, flex: 1, paddingRight: '4px' }}>
          {/* ── 1. Recording ── */}
          {step === 0 && (
            <>
              <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Broadcast name
                <input className="rz-input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Diwali offer — Pune list" />
              </label>

              <div style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                What plays when someone picks up
                {recordings.length === 0 ? (
                  <div style={{ ...panel, color: 'var(--tx-3)', fontSize: '12.5px' }}>
                    No recordings yet — make one on the Recordings tab first.
                  </div>
                ) : (
                  <div style={panel}>
                    {recordings.map((r) => (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '7px 4px', cursor: 'pointer' }}>
                        <input type="radio" name="recording" checked={recordingId === r.id}
                          onChange={() => setRecordingId(r.id)} style={{ accentColor: 'var(--cyan)' }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ color: 'var(--tx)', fontWeight: 600 }}>{r.name}</span>
                          <span className="rz-mono" style={{ color: 'var(--tx-3)', fontSize: '11.5px', marginLeft: '8px' }}>
                            {mmss(r.durationSec)} · {r.source === 'TTS' ? 'generated' : 'uploaded'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Play it
                <select className="rz-input" value={repeatCount}
                  onChange={(e) => setRepeatCount(Number(e.target.value))}>
                  <option value={1}>once</option>
                  <option value={2}>twice — for short messages people may miss the start of</option>
                  <option value={3}>three times</option>
                </select>
                {recording && repeatCount > 1 && (
                  <span style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                    Each answered call lasts about {mmss(recording.durationSec * repeatCount)} and is billed for it.
                  </span>
                )}
              </label>
            </>
          )}

          {/* ── 2. Audience ── */}
          {step === 1 && (
            <>
              <div style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Contact lists — the same clusters your bulk calls dial
                <div style={panel}>
                  {clusters.length === 0 && (
                    <div style={{ color: 'var(--tx-3)', fontSize: '12.5px' }}>
                      No contact lists yet. Import contacts on the Call Contacts page.
                    </div>
                  )}
                  {clusters.map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '7px 4px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedClusters.includes(c.id)}
                        onChange={() => setSelectedClusters((prev) => toggle(prev, c.id))}
                        style={{ accentColor: 'var(--cyan)' }} />
                      <span style={{ flex: 1, color: 'var(--tx)' }}>{c.name}</span>
                      <span className="rz-mono" style={{ fontSize: '11.5px', color: 'var(--tx-3)' }}>
                        {c.dialableCount}/{c.contactCount} dialable
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {preview && (
                <div style={{ padding: '12px 14px', borderRadius: '10px', fontSize: '12.5px',
                  background: 'var(--s2)', border: '1px solid var(--line)' }}>
                  <strong style={{ color: 'var(--tx)' }}>
                    {preview.dialable.toLocaleString('en-IN')} people will be called
                  </strong>
                  <div style={{ color: 'var(--tx-2)', marginTop: '5px' }}>
                    {preview.rows.toLocaleString('en-IN')} rows across {preview.clusters} list
                    {preview.clusters === 1 ? '' : 's'} · {preview.duplicates} duplicate
                    {preview.duplicates === 1 ? '' : 's'} merged · {preview.optedOut} opted out ·{' '}
                    {preview.invalid} invalid. Opt-outs are re-checked while the broadcast runs, not
                    just now.
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 3. Caller IDs ── */}
          {step === 2 && (
            <>
              <div style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Call from {selectedFrom.length > 1 && (
                  <span style={{ color: 'var(--cyan-fg)' }}>— rotating across {selectedFrom.length} numbers</span>
                )}
                <div style={panel}>
                  {callerNumbers.length === 0 && (
                    <div style={{ color: 'var(--tx-3)', fontSize: '12.5px' }}>
                      No caller IDs available. Add one on the Phone Numbers page.
                    </div>
                  )}
                  {callerNumbers.map((n) => (
                    <label key={n.phoneNumber} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '7px 4px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedFrom.includes(n.phoneNumber)}
                        onChange={() => setSelectedFrom((prev) => toggle(prev, n.phoneNumber))}
                        style={{ accentColor: 'var(--cyan)' }} />
                      <span style={{ flex: 1, color: 'var(--tx)' }}>{n.label || n.phoneNumber}</span>
                      <span className="rz-mono" style={{ fontSize: '11.5px', color: 'var(--tx-3)' }}>{n.source}</span>
                    </label>
                  ))}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                  Spreading a broadcast across several numbers is what keeps one of them from
                  absorbing the day's spam scoring.
                </span>
              </div>

              {readiness && !readiness.ready && (
                <div style={{ padding: '12px 14px', borderRadius: '10px', fontSize: '12.5px',
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--tx)' }}>
                  {readiness.numbers.filter((n) => !n.ready).map((n) => (
                    <div key={n.fromNumber} style={{ marginBottom: '4px' }}>
                      <strong>{n.fromNumber}</strong>: {n.error}
                    </div>
                  ))}
                </div>
              )}
              {readiness?.ready && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px',
                  background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)', color: 'var(--tx)' }}>
                  ✅ These numbers can place one-way broadcast calls.
                </div>
              )}
            </>
          )}

          {/* ── 4. Review ── */}
          {step === 3 && (
            <>
              <div style={{ border: '1px solid var(--line)', borderRadius: '12px', background: 'var(--s2)', padding: '14px' }}>
                <Row label="Recording" value={`${recording?.name ?? '—'} · ${mmss((recording?.durationSec ?? 0) * repeatCount)} per call`} />
                <Row label="Recipients" value={`${(estimate?.recipients ?? 0).toLocaleString('en-IN')} people`} />
                <Row label="Caller IDs" value={selectedFrom.join(', ')} />
                {estimate && (
                  <>
                    <Row label="Rate" value={`${rupees(estimate.ratePerMinuteCents)}/min · ${rupees(estimate.perCallCents)} per answered call`} />
                    <Row
                      label="Cost"
                      value={`${rupees(estimate.typicalCents)} typical · ${rupees(estimate.maximumCents)} if everyone answers`}
                      strong
                    />
                  </>
                )}
              </div>

              {estimate && (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
                  Only answered calls are charged — a phone that rings out costs nothing. “Typical”
                  assumes {Math.round(estimate.pickupRate * 100)}% pick up; the maximum is what your
                  wallet needs to cover. The broadcast pauses itself rather than going negative.
                </p>
              )}

              <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Send at (leave empty to start now)
                <input className="rz-input" type="datetime-local" value={schedule}
                  onChange={(e) => setSchedule(e.target.value)} />
                <span style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                  Indian regulation confines commercial calls to 9am–9pm; scheduling outside that
                  window is your risk to carry.
                </span>
              </label>

              <label style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', cursor: 'pointer',
                fontSize: '12.5px', color: 'var(--tx)' }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
                  style={{ marginTop: '2px', accentColor: 'var(--cyan)' }} />
                <span>
                  I have consent to call these people, and I understand this places a one-way
                  recorded call that nobody can reply to.
                </span>
              </label>
            </>
          )}

          {error && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: '13px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '18px',
          paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          <button className="rz-btn rz-btn-secondary" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button className="rz-btn rz-btn-primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button className="rz-btn rz-btn-primary" disabled={!canContinue || saving}
              onClick={() => submit(schedule ? 'schedule' : 'now')}>
              {saving ? 'Working…' : schedule ? 'Schedule broadcast' : 'Start broadcast'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '6px 0', fontSize: '13px' }}>
      <span style={{ color: 'var(--tx-3)' }}>{label}</span>
      <span style={{ color: 'var(--tx)', fontWeight: strong ? 700 : 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
