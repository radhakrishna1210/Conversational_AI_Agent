import { useState, useEffect, useCallback } from 'react';
import { whapi } from '../lib/whapi';
import { format, parseISO } from 'date-fns';

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

interface ChatbotData {
  conversations: { total: number; open: number; resolved: number };
  messages: { total: number; inbound: number; outbound: number; delivered: number; read: number };
  contacts: { total: number; new: number; optOuts: number };
  campaigns: { total: number; active: number };
  rates: { deliveryRate: number; readRate: number; optOutRate: number; responseRate: number };
  deliveryChart: { date: string; sent: number; delivered: number; rate: number }[];
}

// Restrained, fixed-order categorical palette (one brand accent + muted neutrals)
// instead of a 6-hue rainbow. Reserve red/amber for actual bad/warning states.
const TEAL = '#0eb39e';
const RED = '#e34948';
const AMBER = '#c98500';
const SLATE = '#64748b';
const VIOLET = '#7c86a0';
const ROSE = '#b06b7a';
const COLORS = [TEAL, SLATE, AMBER, VIOLET, ROSE];

// ─── Small reusable components ────────────────────────────────────────────────

const Badge = ({ label, bg, color }: { label: string; bg: string; color: string }) => (
  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: bg, color }}>{label}</span>
);

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, [string, string]> = {
    completed:  ['rgba(14,179,158,0.15)', TEAL],
    failed:     ['rgba(227,73,72,0.15)',  RED],
    busy:       ['rgba(201,133,0,0.15)',  AMBER],
    'no-answer':['rgba(201,133,0,0.15)',  AMBER],
  };
  const [bg, color] = map[status] ?? ['rgba(255,255,255,0.07)', 'var(--text-muted)'];
  return <Badge label={status} bg={bg} color={color} />;
};

const DirBadge = ({ dir }: { dir: string }) => (
  <Badge label={dir} bg={dir === 'INBOUND' ? 'rgba(14,179,158,0.1)' : 'rgba(255,255,255,0.06)'} color={dir === 'INBOUND' ? TEAL : 'var(--text-secondary)'} />
);

const SentBadge = ({ s }: { s: string | null }) => {
  if (!s) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const map: Record<string, [string, string]> = {
    positive: ['rgba(14,179,158,0.1)', TEAL],
    negative: ['rgba(227,73,72,0.1)', RED],
    neutral:  ['rgba(255,255,255,0.05)','var(--text-muted)'],
  };
  const [bg, color] = map[s] ?? map.neutral;
  return <Badge label={s} bg={bg} color={color} />;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const [tab,         setTab]         = useState<'calls'|'chatbot'>('calls');
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
  const [chatbot,      setChatbot]      = useState<ChatbotData | null>(null);
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

  // Fetch chatbot analytics
  const loadChatbot = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await whapi.get<any>(`/analytics/chatbot/overview?range=${range}`);
      if (r?.success) setChatbot(r.data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { tab === 'calls' ? loadCalls() : loadChatbot(); }, [tab, loadCalls, loadChatbot]);

  // ─── Chart: Area ───────────────────────────────────────────────────────────
  const AreaChart = () => {
    const data = timeSeries?.data ?? [];
    if (!data.length) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)' }}>{loading ? 'Loading…' : 'No data'}</div>;
    const W = 800, H = 260, P = { t:10, r:20, b:40, l:50 };
    const cW = W-P.l-P.r, cH = H-P.t-P.b;
    const max = Math.max(...data.map(d => d.value), 1);
    const pts = data.map((d, i) => ({ x: P.l + (i/(data.length-1||1))*cW, y: P.t + cH - (d.value/max)*cH, ...d }));
    const area = `M ${pts[0].x} ${P.t+cH} ${pts.map(p=>`L ${p.x} ${p.y}`).join(' ')} L ${pts[pts.length-1].x} ${P.t+cH} Z`;
    const line = `M ${pts[0].x} ${pts[0].y} ${pts.slice(1).map(p=>`L ${p.x} ${p.y}`).join(' ')}`;
    const step = Math.max(1, Math.floor(data.length/6));
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%' }} preserveAspectRatio="none">
        {[0,.25,.5,.75,1].map((r,i) => { const y = P.t+cH-r*cH; return <g key={i}><line x1={P.l} y1={y} x2={W-P.r} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3"/><text x={P.l-6} y={y+4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{metric==='duration'?`${Math.round(max*r)}m`:Math.round(max*r)}</text></g>; })}
        {data.filter((_,i)=>i%step===0||i===data.length-1).map((d,i)=><text key={i} x={P.l+(data.indexOf(d)/(data.length-1||1))*cW} y={H-10} textAnchor="middle" fill="var(--text-muted)" fontSize="11">{format(parseISO(d.date),'MMM dd')}</text>)}
        <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEAL} stopOpacity=".25"/><stop offset="100%" stopColor={TEAL} stopOpacity="0"/></linearGradient></defs>
        <path d={area} fill="url(#ag)"/>
        <path d={line} fill="none" stroke={TEAL} strokeWidth="2"/>
        {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill={TEAL} stroke="#1a1a2e" strokeWidth="2"><title>{p.date}: {p.value}</title></circle>)}
      </svg>
    );
  };

  // ─── Chart: Donut ──────────────────────────────────────────────────────────
  const DonutChart = () => {
    if (!outcomes.length) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)' }}>No data</div>;
    const total = outcomes.reduce((s,o)=>s+o.count,0);
    const sz=180, cx=90, cy=90, r=60, ri=40;
    let angle=0;
    const slices = outcomes.map((o,i)=>{
      const a=(o.count/total)*360, ea=angle+a, big=a>180?1:0;
      const x1=cx+r*Math.cos((angle-90)*Math.PI/180), y1=cy+r*Math.sin((angle-90)*Math.PI/180);
      const x2=cx+r*Math.cos((ea-90)*Math.PI/180),    y2=cy+r*Math.sin((ea-90)*Math.PI/180);
      const x3=cx+ri*Math.cos((ea-90)*Math.PI/180),   y3=cy+ri*Math.sin((ea-90)*Math.PI/180);
      const x4=cx+ri*Math.cos((angle-90)*Math.PI/180),y4=cy+ri*Math.sin((angle-90)*Math.PI/180);
      const d=`M ${x1} ${y1} A ${r} ${r} 0 ${big} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${big} 0 ${x4} ${y4} Z`;
      angle=ea; return { d, color: COLORS[i%COLORS.length], ...o };
    });
    return <svg viewBox={`0 0 ${sz} ${sz}`} style={{ width:'100%', height:'100%', maxHeight:'180px' }}>{slices.map((s,i)=><path key={i} d={s.d} fill={s.color} stroke="#1a1a2e" strokeWidth="2"><title>{s.outcome}: {s.count}</title></path>)}<text x={cx} y={cy-4} textAnchor="middle" fill="white" fontSize="14" fontWeight="700">{total}</text><text x={cx} y={cy+12} textAnchor="middle" fill="var(--text-muted)" fontSize="10">Total</text></svg>;
  };

  // ─── Chart: Bar (sentiment) ────────────────────────────────────────────────
  const BarChart = () => {
    if (!sentiment.length) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)' }}>No data</div>;
    const W=300,H=200,P={t:10,r:20,b:30,l:40};
    const cW=W-P.l-P.r, cH=H-P.t-P.b;
    const max=Math.max(...sentiment.map(d=>d.count),1);
    const bw=cW/sentiment.length*.6, bg=cW/sentiment.length*.4;
    return <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%' }}>{[0,.25,.5,.75,1].map((r,i)=>{const y=P.t+cH-r*cH;return <g key={i}><line x1={P.l} y1={y} x2={W-P.r} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3"/><text x={P.l-4} y={y+4} textAnchor="end" fill="var(--text-muted)" fontSize="10">{Math.round(max*r)}</text></g>;})}
    {sentiment.map((d,i)=>{const bh=(d.count/max)*cH,x=P.l+i*(bw+bg)+bg/2,y=P.t+cH-bh;const c=d.sentiment==='positive'?TEAL:d.sentiment==='negative'?RED:SLATE;return <g key={i}><rect x={x} y={y} width={bw} height={bh} fill={c} rx="3"/><text x={x+bw/2} y={H-10} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{d.sentiment}</text><text x={x+bw/2} y={y-5} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">{d.count}</text></g>;})}
    </svg>;
  };

  // ─── Shared styles ─────────────────────────────────────────────────────────
  const card: React.CSSProperties = { border:'1px solid var(--border)', borderRadius:'8px', background:'rgba(255,255,255,0.01)', padding:'24px' };
  const tabBtn = (active: boolean): React.CSSProperties => ({ background: active?'rgba(255,255,255,0.05)':'transparent', border: active?'1px solid var(--border)':'1px solid transparent', color: active?'white':'var(--text-secondary)', padding:'8px 24px', borderRadius:'6px', fontSize:'13px', fontWeight:600, cursor:'pointer' });
  const rangeBtn = (active: boolean): React.CSSProperties => ({ background: active?'rgba(14,179,158,0.05)':'transparent', border: active?'1px solid rgba(14,179,158,0.3)':'1px solid transparent', color: active?'var(--teal)':'white', padding:'6px 16px', borderRadius:'6px', fontSize:'12px', fontWeight:600, cursor:'pointer' });
  const inp: React.CSSProperties = { padding:'6px 12px', fontSize:'13px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'white' };

  const StatCard = ({ title, value, trend, icon, suffix='' }: any) => (
    <div style={{ ...card, borderTop:'2px solid var(--teal)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <span style={{ color:'var(--text-secondary)', fontSize:'13px', fontWeight:600 }}>{title}</span>
        <span style={{ fontSize:'20px' }}>{icon}</span>
      </div>
      <div style={{ fontSize:'28px', fontWeight:700, color:'white', marginBottom:'8px' }}>{loading?'—':value}{suffix}</div>
      {trend != null && !loading && (
        <div style={{ fontSize:'12px', fontWeight:600, color:trend>=0?TEAL:RED }}>
          {trend>=0?'↑':'↓'} {Math.abs(trend)}% vs prev period
        </div>
      )}
    </div>
  );

  const MiniCard = ({ label, value, color }: any) => (
    <div style={{ ...card, textAlign:'center' }}>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>{label}</div>
      <div style={{ fontSize:'20px', fontWeight:700, color }}>{loading?'—':value}</div>
    </div>
  );

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'24px', maxWidth:'1400px', margin:'0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom:'32px' }}>
        <h1 style={{ fontSize:'28px', fontWeight:800, letterSpacing:'-0.5px', color:'white', marginBottom:'6px' }}>Analytics</h1>
        <p style={{ color:'var(--text-secondary)', fontSize:'14px' }}>View and analyze your call and chatbot performance metrics</p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background:'rgba(227,73,72,0.1)', border:'1px solid rgba(227,73,72,0.3)', borderRadius:'8px', padding:'12px 16px', color:RED, fontSize:'13px', marginBottom:'16px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ ...card, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px', marginBottom:'24px' }}>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
          {(['7d','30d','90d'] as const).map(r => (
            <button key={r} onClick={() => { setCustomFrom(''); setCustomTo(''); setRange(r); }} style={rangeBtn(range===r && !customFrom)}>
              Last {r==='7d'?'7 days':r==='30d'?'30 days':'90 days'}
            </button>
          ))}
          <div style={{ width:'1px', height:'24px', background:'var(--border)' }} />
          <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={inp} />
          <span style={{ color:'var(--text-muted)' }}>to</span>
          <input type="date" value={customTo}   onChange={e=>setCustomTo(e.target.value)}   style={inp} />
          {customFrom && customTo && (
            <button onClick={() => tab==='calls'?loadCalls():loadChatbot()} style={{ background:'var(--teal)', color:'#1a1a2e', border:'none', padding:'6px 14px', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>Apply</button>
          )}
        </div>
        {tab==='calls' && (
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ color:'white', fontSize:'13px', fontWeight:600 }}>Agent</span>
            <select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)} style={{ ...inp, paddingRight:'28px' }}>
              <option value="all">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'24px' }}>
        <button onClick={()=>setTab('calls')}   style={tabBtn(tab==='calls')}>📞 Phone Call Analytics</button>
        <button onClick={()=>setTab('chatbot')} style={tabBtn(tab==='chatbot')}>💬 Website Chatbot Analytics</button>
      </div>

      {tab === 'calls' ? (
        <>
          {/* Stat cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'16px', marginBottom:'24px' }}>
            <StatCard title="Total Calls"     value={overview?.totalCalls??0}     trend={overview?.totalCallsTrend}    icon="📞" />
            <StatCard title="Total Duration"  value={overview?.totalDuration??0}  trend={overview?.totalDurationTrend} icon="🕒" suffix=" min" />
            <StatCard title="Avg Duration"    value={overview?.avgDuration??0}    icon="⏱️" suffix=" min" />
            <StatCard title="Total Agents"    value={overview?.totalAgents??0}    icon="👥" />
          </div>

          {/* Mini metric strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'12px', marginBottom:'24px' }}>
            <MiniCard label="Success Rate" value={`${overview?.successRate??0}%`}    color={TEAL} />
            <MiniCard label="Completed"    value={overview?.completedCalls??0}       color={TEAL} />
            <MiniCard label="Failed"       value={overview?.failedCalls??0}          color={RED} />
            <MiniCard label="Inbound"      value={overview?.inboundCalls??0}         color="var(--text-secondary)" />
            <MiniCard label="Outbound"     value={overview?.outboundCalls??0}        color="var(--text-secondary)" />
          </div>

          {/* Metric toggle */}
          <div style={{ display:'flex', gap:'4px', marginBottom:'16px' }}>
            {(['volume','duration'] as const).map(m => (
              <button key={m} onClick={()=>setMetric(m)} style={tabBtn(metric===m)}>
                {m==='volume'?'Call Volume':'Call Duration'}
              </button>
            ))}
          </div>

          {/* Area chart */}
          <div style={{ ...card, marginBottom:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
              <div>
                <h3 style={{ color:'white', fontSize:'16px', fontWeight:700, marginBottom:'4px' }}>{metric==='volume'?'Call Volume Over Time':'Call Duration Over Time'}</h3>
                <p style={{ color:'var(--text-secondary)', fontSize:'13px' }}>{metric==='volume'?'Calls per day':'Total duration per day (minutes)'}</p>
              </div>
              {timeSeries?.summary && (
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>Total</div>
                  <div style={{ fontSize:'18px', fontWeight:700, color:'var(--teal)' }}>{timeSeries.summary.total?.toLocaleString()}{metric==='duration'?' min':''}</div>
                </div>
              )}
            </div>
            <div style={{ height:'280px' }}><AreaChart /></div>
          </div>

          {/* Bottom grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:'24px', marginBottom:'24px' }}>
            {/* Outcomes donut */}
            <div style={card}>
              <h3 style={{ color:'white', fontSize:'16px', fontWeight:700, marginBottom:'16px' }}>Call Outcomes</h3>
              <div style={{ height:'180px', display:'flex', justifyContent:'center' }}><DonutChart /></div>
              <div style={{ marginTop:'16px' }}>
                {outcomes.map((o,i) => (
                  <div key={o.outcome} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:COLORS[i%COLORS.length] }} />
                      <span style={{ color:'var(--text-secondary)', fontSize:'13px', textTransform:'capitalize' }}>{o.outcome.replace(/_/g,' ')}</span>
                    </div>
                    <span style={{ color:'white', fontSize:'13px', fontWeight:600 }}>{o.count} ({o.percentage}%)</span>
                  </div>
                ))}
                {!outcomes.length && !loading && <p style={{ color:'var(--text-muted)', fontSize:'13px', textAlign:'center' }}>No outcome data for this period</p>}
              </div>
            </div>

            {/* Sentiment bar */}
            <div style={card}>
              <h3 style={{ color:'white', fontSize:'16px', fontWeight:700, marginBottom:'16px' }}>Sentiment Analysis</h3>
              <div style={{ height:'180px' }}><BarChart /></div>
              <div style={{ marginTop:'16px' }}>
                {sentiment.map(s => (
                  <div key={s.sentiment} style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                    <span style={{ color:'var(--text-secondary)', fontSize:'13px', textTransform:'capitalize' }}>{s.sentiment}</span>
                    <span style={{ color:'white', fontSize:'13px', fontWeight:600 }}>{s.count} calls · avg {s.avgDuration} min</span>
                  </div>
                ))}
                {!sentiment.length && !loading && <p style={{ color:'var(--text-muted)', fontSize:'13px', textAlign:'center' }}>No sentiment data for this period</p>}
              </div>
            </div>

            {/* Heatmap */}
            <div style={card}>
              <h3 style={{ color:'white', fontSize:'16px', fontWeight:700, marginBottom:'16px' }}>Call Activity Heatmap</h3>
              <div style={{ overflowX:'auto' }}>
                <div style={{ display:'grid', gridTemplateColumns:'36px repeat(24,1fr)', gap:'2px', minWidth:'480px' }}>
                  <div />
                  {Array.from({length:24},(_,h) => <div key={h} style={{ textAlign:'center', fontSize:'9px', color:'var(--text-muted)' }}>{h}</div>)}
                  {heatmap.map(day => (
                    <>
                      <div key={day.day} style={{ fontSize:'10px', color:'var(--text-secondary)', display:'flex', alignItems:'center' }}>{day.day}</div>
                      {day.hours.map(h => (
                        <div key={h.hour} title={`${day.day} ${h.hour}:00 — ${h.count} calls`}
                          style={{ aspectRatio:'1', borderRadius:'2px', minWidth:'14px',
                            background: h.count>0 ? `rgba(14,179,158,${Math.max(h.intensity/100, 0.1)})` : 'rgba(255,255,255,0.03)' }} />
                      ))}
                    </>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Call logs table */}
          <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', background:'rgba(255,255,255,0.01)', marginBottom:'24px' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ color:'white', fontSize:'16px', fontWeight:700 }}>Recent Calls</h3>
              <span style={{ color:'var(--text-muted)', fontSize:'13px' }}>{callLogs?.pagination?.total??0} total</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Agent','From','To','Direction','Status','Duration','Cost','Sentiment','Started'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>Loading…</td></tr>
                  ) : !callLogs?.data?.length ? (
                    <tr><td colSpan={9} style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>No calls found</td></tr>
                  ) : callLogs.data.map(c => (
                    <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding:'10px 14px', color:'white',              fontSize:'13px', fontWeight:600 }}>{c.assistant}</td>
                      <td style={{ padding:'10px 14px', color:'var(--text-secondary)', fontSize:'13px' }}>{c.from}</td>
                      <td style={{ padding:'10px 14px', color:'var(--text-secondary)', fontSize:'13px' }}>{c.to}</td>
                      <td style={{ padding:'10px 14px' }}><DirBadge dir={c.direction} /></td>
                      <td style={{ padding:'10px 14px' }}><StatusBadge status={c.status} /></td>
                      <td style={{ padding:'10px 14px', color:'white',              fontSize:'13px', fontWeight:600 }}>{c.durationFormatted}</td>
                      <td style={{ padding:'10px 14px', color:'var(--text-secondary)', fontSize:'13px' }}>${c.cost?.toFixed(2)??'0.00'}</td>
                      <td style={{ padding:'10px 14px' }}><SentBadge s={c.sentiment} /></td>
                      <td style={{ padding:'10px 14px', color:'var(--text-muted)',  fontSize:'13px', whiteSpace:'nowrap' }}>{c.startedAt ? format(parseISO(c.startedAt),'MMM dd, HH:mm') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {callLogs?.pagination && callLogs.pagination.totalPages > 1 && (
              <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <button disabled={!callLogs.pagination.hasPrev} onClick={()=>setLogsPage(p=>p-1)} style={{ padding:'6px 16px', borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color: callLogs.pagination.hasPrev?'white':'var(--text-muted)', cursor: callLogs.pagination.hasPrev?'pointer':'not-allowed', fontSize:'13px' }}>← Prev</button>
                <span style={{ color:'var(--text-secondary)', fontSize:'13px' }}>Page {callLogs.pagination.page} / {callLogs.pagination.totalPages}</span>
                <button disabled={!callLogs.pagination.hasNext} onClick={()=>setLogsPage(p=>p+1)} style={{ padding:'6px 16px', borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color: callLogs.pagination.hasNext?'white':'var(--text-muted)', cursor: callLogs.pagination.hasNext?'pointer':'not-allowed', fontSize:'13px' }}>Next →</button>
              </div>
            )}
          </div>

          {/* Agent performance table */}
          {agentPerf.length > 0 && (
            <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', background:'rgba(255,255,255,0.01)' }}>
              <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)' }}>
                <h3 style={{ color:'white', fontSize:'16px', fontWeight:700 }}>Agent Performance</h3>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['Agent','Total','Completed','Failed','Avg Duration','Success Rate','Cost'].map(h=>(
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agentPerf.map(a => (
                      <tr key={a.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding:'10px 14px', color:'white',  fontSize:'13px', fontWeight:600 }}>{a.name}</td>
                        <td style={{ padding:'10px 14px', color:'white',  fontSize:'13px' }}>{a.totalCalls}</td>
                        <td style={{ padding:'10px 14px', color:TEAL,fontSize:'13px' }}>{a.completedCalls}</td>
                        <td style={{ padding:'10px 14px', color:RED,fontSize:'13px' }}>{a.failedCalls}</td>
                        <td style={{ padding:'10px 14px', color:'var(--text-secondary)', fontSize:'13px' }}>{a.avgDuration} min</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:700, background: a.successRate>=50?'rgba(14,179,158,0.1)':'rgba(227,73,72,0.1)', color: a.successRate>=50?TEAL:RED }}>{a.successRate}%</span>
                        </td>
                        <td style={{ padding:'10px 14px', color:'var(--text-secondary)', fontSize:'13px' }}>${a.totalCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Chatbot tab ── */
        <>
          {chatbot ? (
            <>
              {/* KPI cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'16px', marginBottom:'24px' }}>
                {[
                  { label:'💬 Messages',     val: chatbot.messages.total,       sub:`${chatbot.messages.inbound} in · ${chatbot.messages.outbound} out` },
                  { label:'🗨️ Conversations', val: chatbot.conversations.total,  sub:`${chatbot.conversations.open} open · ${chatbot.conversations.resolved} resolved` },
                  { label:'👥 Contacts',      val: chatbot.contacts.total,       sub:`+${chatbot.contacts.new} new this period` },
                  { label:'📣 Campaigns',     val: chatbot.campaigns.total,      sub:`${chatbot.campaigns.active} active` },
                ].map(({ label, val, sub }) => (
                  <div key={label} style={{ ...card, borderTop:'2px solid var(--teal)' }}>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)', fontWeight:600, marginBottom:'8px' }}>{label}</div>
                    <div style={{ fontSize:'28px', fontWeight:700, color:'white' }}>{val.toLocaleString()}</div>
                    <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px' }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Rate metrics */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'12px', marginBottom:'24px' }}>
                <MiniCard label="Delivery Rate"  value={`${chatbot.rates.deliveryRate}%`}  color={TEAL} />
                <MiniCard label="Read Rate"      value={`${chatbot.rates.readRate}%`}      color={TEAL} />
                <MiniCard label="Response Rate"  value={`${chatbot.rates.responseRate}%`}  color={TEAL} />
                <MiniCard label="Opt-Out Rate"   value={`${chatbot.rates.optOutRate}%`}    color={RED} />
                <MiniCard label="Opt-Outs"       value={chatbot.contacts.optOuts}          color={RED} />
              </div>

              {/* Delivery bar chart */}
              <div style={{ ...card, marginBottom:'24px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                  <div>
                    <h3 style={{ color:'white', fontSize:'16px', fontWeight:700, marginBottom:'4px' }}>Message Delivery Rate</h3>
                    <p style={{ color:'var(--text-secondary)', fontSize:'13px' }}>Daily sent vs delivered</p>
                  </div>
                  <div style={{ display:'flex', gap:'16px', fontSize:'11px', color:'var(--text-muted)' }}>
                    <span><span style={{ color:TEAL }}>■</span> &gt;97%</span>
                    <span><span style={{ color:AMBER }}>■</span> 93–97%</span>
                    <span><span style={{ color:RED }}>■</span> &lt;93%</span>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'120px' }}>
                  {chatbot.deliveryChart.map(d => (
                    <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                      <span style={{ fontSize:'9px', color:'var(--text-muted)' }}>{d.sent>0?`${d.rate}%`:'—'}</span>
                      <div style={{ width:'100%', minHeight:'2px', height:`${d.sent>0?Math.max(d.rate,2):2}%`, background: d.rate>97?TEAL:d.rate>93?AMBER:RED, borderRadius:'3px 3px 0 0' }} title={`${d.date}: ${d.sent} sent, ${d.delivered} delivered`} />
                      <span style={{ fontSize:'9px', color:'var(--text-muted)' }}>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message breakdown + conversation status */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'24px' }}>
                <div style={card}>
                  <h3 style={{ color:'white', fontSize:'15px', fontWeight:700, marginBottom:'16px' }}>Message Breakdown</h3>
                  {[
                    { label:'Sent (outbound)',    val: chatbot.messages.outbound,  color:TEAL, max: chatbot.messages.total },
                    { label:'Received (inbound)', val: chatbot.messages.inbound,   color:TEAL, max: chatbot.messages.total },
                    { label:'Delivered',          val: chatbot.messages.delivered, color:TEAL, max: chatbot.messages.outbound },
                    { label:'Read',               val: chatbot.messages.read,      color:TEAL, max: chatbot.messages.outbound },
                  ].map(({ label, val, color, max }) => (
                    <div key={label} style={{ marginBottom:'12px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                        <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontSize:'13px', color:'white', fontWeight:600 }}>{val.toLocaleString()}</span>
                      </div>
                      <div style={{ height:'4px', background:'rgba(255,255,255,0.05)', borderRadius:'2px' }}>
                        <div style={{ height:'100%', width:`${max>0?Math.min((val/max)*100,100):0}%`, background:color, borderRadius:'2px', transition:'width 0.5s' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <h3 style={{ color:'white', fontSize:'15px', fontWeight:700, marginBottom:'16px' }}>Conversation Status</h3>
                  {[
                    { label:'Open',       val: chatbot.conversations.open,     color:AMBER },
                    { label:'Resolved',   val: chatbot.conversations.resolved, color:TEAL },
                    { label:'This Period',val: chatbot.conversations.total,    color:'var(--text-secondary)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>{label}</span>
                      <span style={{ fontSize:'18px', fontWeight:700, color }}>{val.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...card, textAlign:'center', padding:'60px' }}>
              {loading ? <><div style={{ fontSize:'32px', marginBottom:'12px' }}>⏳</div><p style={{ color:'var(--text-muted)' }}>Loading chatbot data…</p></> : <><div style={{ fontSize:'48px', marginBottom:'16px' }}>💬</div><h3 style={{ color:'white', marginBottom:'8px' }}>No Chatbot Data Yet</h3><p style={{ color:'var(--text-muted)' }}>Send your first WhatsApp campaign to see analytics here.</p></>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
