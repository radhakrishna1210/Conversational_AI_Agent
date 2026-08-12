import { useState, useEffect, useCallback } from 'react';
import { whapi } from '../lib/whapi';
import { format, parseISO } from 'date-fns';
import { RzCard, RzStat, RzTabs, RzMeter, RzEmpty, RzPill, type Tone } from '@/components/rz';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallOverview {
  totalCalls: number;
  totalCallsTrend: number;
  totalDuration: number;
  totalDurationTrend: number;
  avgDuration: number;
  totalAgents: number;
  completedCalls: number;
  failedCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  successRate: number;
}

interface TimeSeriesPoint {
  date: string;
  value: number;
  inbound: number;
  outbound: number;
  completed: number;
  failed: number;
}

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
}

interface OutcomeItem  { outcome: string;   count: number; percentage: number; }
interface SentimentItem { sentiment: string; count: number; avgDuration: number; }
interface HeatmapDay   { day: string; hours: { hour: number; count: number; intensity: number }[]; }
interface AgentPerf    { id: string; name: string; totalCalls: number; completedCalls: number; failedCalls: number; avgDuration: number; totalCost: number; successRate: number; }
interface AgentItem    { id: string; name: string; }

/*
  The categorical ramp. These were six arbitrary hexes (#00d4c8, #ff6b6b,
  #96ceb4 …) that existed nowhere else in the product; every one of them is now
  a state accent from the design system, so a slice labelled "transferred" is
  the same coral here, on the Calls screen and in the admin console.

  Order matters: the first three carry the most series, so they are the three
  most separable hues.
*/
const SERIES = [
  'var(--cyan)',
  'var(--coral)',
  'var(--violet)',
  'var(--lime)',
  'var(--warn)',
  'var(--tx-3)',
];

/** Outcome / status → the one pill tone that always means that thing. */
const statusTone = (status: string): Tone => {
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'resolved' || s === 'booked') return 'ok';
  if (s === 'failed' || s === 'error') return 'err';
  if (s === 'busy' || s === 'no-answer' || s === 'voicemail') return 'warn';
  if (s === 'transferred') return 'speak';
  return 'idle';
};

const sentimentTone = (s: string | null): Tone =>
  s === 'positive' ? 'ok' : s === 'negative' ? 'err' : 'idle';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const [range,       setRange]       = useState<'7d'|'30d'|'90d'>('7d');
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [agents,      setAgents]      = useState<AgentItem[]>([]);
  const [metric,      setMetric]      = useState<'volume'|'duration'>('volume');
  const [logsPage,    setLogsPage]    = useState(1);

  // Data
  const [overview,     setOverview]     = useState<CallOverview | null>(null);
  const [timeSeries,   setTimeSeries]   = useState<{ data: TimeSeriesPoint[]; summary: any } | null>(null);
  const [callLogs,     setCallLogs]     = useState<{ data: CallLog[]; pagination: any } | null>(null);
  const [outcomes,     setOutcomes]     = useState<OutcomeItem[]>([]);
  const [sentiment,    setSentiment]    = useState<SentimentItem[]>([]);
  const [heatmap,      setHeatmap]      = useState<HeatmapDay[]>([]);
  const [agentPerf,    setAgentPerf]    = useState<AgentPerf[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Build query string
  const qs = useCallback((extra: Record<string, any> = {}) => {
    const p = new URLSearchParams();
    if (customFrom && customTo) { p.set('from', customFrom); p.set('to', customTo); }
    else p.set('range', range);
    if (agentFilter !== 'all') p.set('agentId', agentFilter);
    Object.entries(extra).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return p.toString();
  }, [range, customFrom, customTo, agentFilter]);

  // Fetch call analytics
  const loadCalls = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, ts, lg, oc, se, hm, ap, ag] = await Promise.all([
        whapi.get<any>(`/analytics/calls/overview?${qs()}`),
        whapi.get<any>(`/analytics/calls/timeseries?${qs({ metric })}`),
        whapi.get<any>(`/analytics/calls/logs?${qs({ page: logsPage, limit: 20 })}`),
        whapi.get<any>(`/analytics/calls/outcomes?${qs()}`),
        whapi.get<any>(`/analytics/calls/sentiment?${qs()}`),
        whapi.get<any>(`/analytics/calls/heatmap?${qs()}`),
        whapi.get<any>(`/analytics/calls/assistants?${qs()}`),
        whapi.get<any>('/analytics/calls/assistants-list'),
      ]);
      if (ov?.success) setOverview(ov.data);
      if (ts?.success) setTimeSeries(ts.data);
      if (lg?.success) setCallLogs(lg.data);
      if (oc?.success) setOutcomes(oc.data);
      if (se?.success) setSentiment(se.data);
      if (hm?.success) setHeatmap(hm.data);
      if (ap?.success) setAgentPerf(ap.data);
      if (ag?.success) setAgents(ag.data);
    } catch (e: any) {
      setError(e.message);
      console.error('Analytics error:', e);
    } finally { setLoading(false); }
  }, [qs, metric, logsPage]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  // ─── Chart: Area ───────────────────────────────────────────────────────────
  /*
    Drawn against the tokens rather than fixed hexes: the node halo used to be
    #1a1a2e, a colour that matched neither theme's card, so every point on the
    line wore a dark ring on a white background in light mode.
  */
  const AreaChart = () => {
    const data = timeSeries?.data ?? [];
    if (!data.length) {
      return (
        <div className="rz-empty" style={{ height: '100%', padding: 0 }}>
          <span className="rz-mono">{loading ? 'Loading…' : 'No data for this period'}</span>
        </div>
      );
    }
    const W = 800, H = 260, P = { t:10, r:20, b:40, l:50 };
    const cW = W-P.l-P.r, cH = H-P.t-P.b;
    const max = Math.max(...data.map(d => d.value), 1);
    const pts = data.map((d, i) => ({ x: P.l + (i/(data.length-1||1))*cW, y: P.t + cH - (d.value/max)*cH, ...d }));
    const area = `M ${pts[0].x} ${P.t+cH} ${pts.map(p=>`L ${p.x} ${p.y}`).join(' ')} L ${pts[pts.length-1].x} ${P.t+cH} Z`;
    const line = `M ${pts[0].x} ${pts[0].y} ${pts.slice(1).map(p=>`L ${p.x} ${p.y}`).join(' ')}`;
    const step = Math.max(1, Math.floor(data.length/6));
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%' }} preserveAspectRatio="none">
        {[0,.25,.5,.75,1].map((r,i) => { const y = P.t+cH-r*cH; return <g key={i}><line x1={P.l} y1={y} x2={W-P.r} y2={y} stroke="var(--line)" strokeDasharray="3,3"/><text x={P.l-6} y={y+4} textAnchor="end" fill="var(--tx-3)" fontSize="11" fontFamily="var(--ff-m)">{metric==='duration'?`${Math.round(max*r)}m`:Math.round(max*r)}</text></g>; })}
        {data.filter((_,i)=>i%step===0||i===data.length-1).map((d,i)=><text key={i} x={P.l+(data.indexOf(d)/(data.length-1||1))*cW} y={H-10} textAnchor="middle" fill="var(--tx-3)" fontSize="11" fontFamily="var(--ff-m)">{format(parseISO(d.date),'MMM dd')}</text>)}
        <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cyan)" stopOpacity=".25"/><stop offset="100%" stopColor="var(--cyan)" stopOpacity="0"/></linearGradient></defs>
        <path d={area} fill="url(#ag)"/>
        <path d={line} fill="none" stroke="var(--cyan)" strokeWidth="2"/>
        {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--cyan)" stroke="var(--s1)" strokeWidth="2"><title>{p.date}: {p.value}</title></circle>)}
      </svg>
    );
  };

  const rangeLabel = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' } as const;

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap-wide">

        {/* Header */}
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Operate</div>
            <h1 className="rz-h1">Calls &amp; Analytics</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0' }}>
              Volume, outcomes and latency across every conversation your agents handled.
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="rz-card"
            style={{
              background: 'rgba(248,113,113,0.08)',
              borderColor: 'rgba(248,113,113,0.3)',
              color: 'var(--err)',
              fontSize: 13,
              padding: '12px 16px',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Filter bar */}
        <div className="rz-card rz-between" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="rz-cluster">
            <RzTabs
              tabs={(['7d','30d','90d'] as const).map(r => ({ value: r, label: rangeLabel[r] }))}
              value={customFrom && customTo ? ('' as any) : range}
              onChange={(r) => { setCustomFrom(''); setCustomTo(''); setRange(r); }}
            />
            <span className="rz-divider" style={{ width: 1, height: 22, background: 'var(--line)' }} />
            <input type="date" className="rz-input" style={{ width: 'auto' }} value={customFrom} onChange={e=>setCustomFrom(e.target.value)} />
            <span className="rz-mono">to</span>
            <input type="date" className="rz-input" style={{ width: 'auto' }} value={customTo} onChange={e=>setCustomTo(e.target.value)} />
            {customFrom && customTo && (
              <button className="rz-btn rz-btn-primary rz-btn-sm" onClick={() => loadCalls()}>Apply</button>
            )}
          </div>
          <div className="rz-cluster-sm">
            <span className="rz-label">Agent</span>
            <select className="rz-select" style={{ width: 'auto', minWidth: 160 }} value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}>
              <option value="all">All agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="rz-stack">

          {/* KPI row */}
          <div className="rz-stats">
            <RzStat label="TOTAL CALLS"    value={loading ? '—' : (overview?.totalCalls ?? 0)}
              delta={overview?.totalCallsTrend != null && !loading ? `${overview.totalCallsTrend >= 0 ? '↑' : '↓'} ${Math.abs(overview.totalCallsTrend)}% vs prev` : undefined}
              trend={(overview?.totalCallsTrend ?? 0) >= 0 ? 'up' : 'down'} />
            <RzStat label="TOTAL DURATION" value={loading ? '—' : `${overview?.totalDuration ?? 0}m`}
              delta={overview?.totalDurationTrend != null && !loading ? `${overview.totalDurationTrend >= 0 ? '↑' : '↓'} ${Math.abs(overview.totalDurationTrend)}% vs prev` : undefined}
              trend={(overview?.totalDurationTrend ?? 0) >= 0 ? 'up' : 'down'} />
            <RzStat label="AVG DURATION"   value={loading ? '—' : `${overview?.avgDuration ?? 0}m`} />
            <RzStat label="SUCCESS RATE"   value={loading ? '—' : `${overview?.successRate ?? 0}%`} color="var(--lime)" />
            <RzStat label="AGENTS"         value={loading ? '—' : (overview?.totalAgents ?? 0)} />
          </div>

          {/* Secondary strip */}
          <div className="rz-stats">
            <RzStat label="COMPLETED" value={loading ? '—' : (overview?.completedCalls ?? 0)} color="var(--lime)" />
            <RzStat label="FAILED"    value={loading ? '—' : (overview?.failedCalls ?? 0)}    color="var(--err)" />
            <RzStat label="INBOUND"   value={loading ? '—' : (overview?.inboundCalls ?? 0)}   color="var(--cyan-fg)" />
            <RzStat label="OUTBOUND"  value={loading ? '—' : (overview?.outboundCalls ?? 0)}  color="var(--violet)" />
          </div>

          {/* Volume chart + outcomes */}
          <div className="rz-grid-main">
            <RzCard
              title={metric === 'volume' ? 'Call volume over time' : 'Call duration over time'}
              actions={
                <RzTabs
                  tabs={[{ value: 'volume', label: 'Volume' }, { value: 'duration', label: 'Duration' }]}
                  value={metric}
                  onChange={setMetric}
                />
              }
            >
              {timeSeries?.summary && (
                <div className="rz-cluster-sm" style={{ marginBottom: 10 }}>
                  <span className="rz-label">Total</span>
                  <span className="rz-metric-sm" style={{ color: 'var(--cyan-fg)' }}>
                    {timeSeries.summary.total?.toLocaleString()}{metric === 'duration' ? ' min' : ''}
                  </span>
                </div>
              )}
              <div style={{ height: 260 }}><AreaChart /></div>
            </RzCard>

            <RzCard title="Outcomes">
              {outcomes.length ? (
                <div className="rz-stack" style={{ gap: 12 }}>
                  {outcomes.map((o, i) => (
                    <RzMeter
                      key={o.outcome}
                      label={<span style={{ textTransform: 'capitalize' }}>{o.outcome.replace(/_/g, ' ')}</span>}
                      hint={`${o.count} · ${o.percentage}%`}
                      segments={[{ pct: o.percentage, color: SERIES[i % SERIES.length] }]}
                    />
                  ))}
                </div>
              ) : (
                <RzEmpty title="No outcomes yet" text="Outcomes appear once your agents have completed calls in this period." />
              )}
            </RzCard>
          </div>

          {/* Sentiment + heatmap */}
          <div className="rz-grid-2">
            <RzCard title="Sentiment">
              {sentiment.length ? (
                <div className="rz-stack" style={{ gap: 12 }}>
                  {sentiment.map(s => {
                    const total = sentiment.reduce((sum, x) => sum + x.count, 0) || 1;
                    return (
                      <RzMeter
                        key={s.sentiment}
                        label={<span style={{ textTransform: 'capitalize' }}>{s.sentiment}</span>}
                        hint={`${s.count} calls · avg ${s.avgDuration}m`}
                        segments={[{
                          pct: (s.count / total) * 100,
                          color: s.sentiment === 'positive' ? 'var(--lime)'
                            : s.sentiment === 'negative' ? 'var(--err)'
                            : 'var(--tx-3)',
                        }]}
                      />
                    );
                  })}
                </div>
              ) : (
                <RzEmpty title="No sentiment data" text="Sentiment is scored after a call completes with a transcript." />
              )}
            </RzCard>

            <RzCard title="Activity by hour">
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, 1fr)', gap: 2, minWidth: 480 }}>
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="rz-mono-xs" style={{ textAlign: 'center', fontSize: 9 }}>{h}</div>
                  ))}
                  {heatmap.map(day => (
                    <div key={day.day} style={{ display: 'contents' }}>
                      <div className="rz-mono-xs" style={{ display: 'flex', alignItems: 'center' }}>{day.day}</div>
                      {day.hours.map(h => (
                        <div
                          key={h.hour}
                          title={`${day.day} ${h.hour}:00 — ${h.count} calls`}
                          style={{
                            aspectRatio: '1',
                            borderRadius: 2,
                            minWidth: 14,
                            background: h.count > 0
                              ? `rgba(14,179,158,${Math.max(h.intensity / 100, 0.12)})`
                              : 'var(--s2)',
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </RzCard>
          </div>

          {/* Call log table */}
          <RzCard
            flush
            title="Recent calls"
            actions={<span className="rz-mono">{callLogs?.pagination?.total ?? 0} total</span>}
          >
            <div className="rz-table-wrap">
              <table className="rz-table">
                <thead>
                  <tr>
                    {['Agent','From','To','Direction','Status','Duration','Cost','Sentiment','Started'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }} className="rz-mono">Loading…</td></tr>
                  ) : !callLogs?.data?.length ? (
                    <tr><td colSpan={9} style={{ padding: 0 }}>
                      <RzEmpty title="No calls in this period" text="Adjust the date range or agent filter to widen the search." />
                    </td></tr>
                  ) : callLogs.data.map(c => (
                    <tr key={c.id}>
                      <td className="rz-td-strong">{c.assistant}</td>
                      <td className="rz-td-mono">{c.from}</td>
                      <td className="rz-td-mono">{c.to}</td>
                      <td><RzPill tone={c.direction === 'INBOUND' ? 'info' : 'think'}>{c.direction?.toLowerCase()}</RzPill></td>
                      <td><RzPill tone={statusTone(c.status)}>{c.status}</RzPill></td>
                      <td className="rz-td-strong rz-td-mono">{c.durationFormatted}</td>
                      <td className="rz-td-mono">${c.cost?.toFixed(2) ?? '0.00'}</td>
                      <td>{c.sentiment ? <RzPill tone={sentimentTone(c.sentiment)}>{c.sentiment}</RzPill> : <span className="rz-muted">—</span>}</td>
                      <td className="rz-td-mono" style={{ whiteSpace: 'nowrap' }}>{c.startedAt ? format(parseISO(c.startedAt), 'MMM dd, HH:mm') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {callLogs?.pagination && callLogs.pagination.totalPages > 1 && (
              <div className="rz-between" style={{ padding: '14px 18px', borderTop: '1px solid var(--line)' }}>
                <button className="rz-btn rz-btn-ghost rz-btn-sm" disabled={!callLogs.pagination.hasPrev} onClick={() => setLogsPage(p => p - 1)}>← Prev</button>
                <span className="rz-mono">Page {callLogs.pagination.page} / {callLogs.pagination.totalPages}</span>
                <button className="rz-btn rz-btn-ghost rz-btn-sm" disabled={!callLogs.pagination.hasNext} onClick={() => setLogsPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </RzCard>

          {/* Agent performance */}
          {agentPerf.length > 0 && (
            <RzCard flush title="Agent performance">
              <div className="rz-table-wrap">
                <table className="rz-table">
                  <thead>
                    <tr>
                      {['Agent','Total','Completed','Failed','Avg duration','Success rate','Cost'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {agentPerf.map(a => (
                      <tr key={a.id}>
                        <td className="rz-td-strong">{a.name}</td>
                        <td className="rz-td-mono">{a.totalCalls}</td>
                        <td className="rz-td-mono" style={{ color: 'var(--lime)' }}>{a.completedCalls}</td>
                        <td className="rz-td-mono" style={{ color: 'var(--err)' }}>{a.failedCalls}</td>
                        <td className="rz-td-mono">{a.avgDuration} min</td>
                        <td><RzPill tone={a.successRate >= 50 ? 'ok' : 'err'}>{a.successRate}%</RzPill></td>
                        <td className="rz-td-mono">${a.totalCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RzCard>
          )}
        </div>
      </div>
    </div>
  );
}
