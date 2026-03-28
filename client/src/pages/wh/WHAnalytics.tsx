const S = {
  page: { padding: '28px', maxWidth: '960px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b' },
  pageTitle: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#1e293b' },
  pageSubtitle: { fontSize: '14px', color: '#64748b', marginBottom: '28px' },
  card: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', marginBottom: '20px' },
  sectionTitle: { fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' },
  btnGhost: { backgroundColor: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' },
};

const kpis: { label: string; value: string; trend: string; color: string; trendUp: boolean }[] = [];

const delivery: number[] = [];
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const agentData: { name: string; chats: number; avgResp: string; csat: string }[] = [];

export default function WHAnalytics() {
  return (
    <div style={S.page}>
      <div style={S.pageTitle}>📊 Analytics & Reports</div>
      <div style={S.pageSubtitle}>Track delivery rates, campaign performance, agent metrics, and opt-out trends.</div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{k.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: k.color, marginBottom: '6px' }}>{k.value}</div>
            <div style={{ fontSize: '12px', color: k.trendUp ? '#10b981' : '#ef4444', fontWeight: 600 }}>{k.trendUp ? '▲' : '▼'} {k.trend} vs last week</div>
          </div>
        ))}
      </div>

      {/* Delivery Rate Chart */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>Message Delivery Rate (Last 7 Days)</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={S.btnGhost}>Export CSV</button>
            <button style={S.btnGhost}>Export PDF</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '160px' }}>
          {delivery.map((val, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{val}%</div>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: `${val}%`, backgroundColor: val >= 97 ? '#10b981' : val >= 93 ? '#f59e0b' : '#ef4444', borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{days[i]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Performance */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>Campaign Performance</div>
        </div>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' as const }}>
          {([] as { label: string; val: number; color: string }[]).map((s, i) => (
            <div key={i} style={{ flex: 1, minWidth: '120px' }}>
              <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                <span>{s.label}</span><span style={{ fontWeight: 700 }}>{s.val.toLocaleString()}</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}>
                <div style={{ height: '100%', width: `${(s.val / 6000) * 100}%`, backgroundColor: s.color, borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Opt-out Trend */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Opt-out Rate Trend</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '80px' }}>
          {([] as number[]).map((val, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{val}%</div>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: `${(val / 1.5) * 100}%`, backgroundColor: '#fca5a5', borderRadius: '3px 3px 0 0' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{days[i]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Response Time */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Agent Performance</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ backgroundColor: '#f8fafc' }}>
            {['Agent', 'Chats Handled', 'Avg Response Time', 'CSAT Score'].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {agentData.map((a, i) => (
              <tr key={i}>
                <td style={{ padding: '12px 14px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{a.name}</td>
                <td style={{ padding: '12px 14px', color: '#3b82f6', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{a.chats}</td>
                <td style={{ padding: '12px 14px', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>{a.avgResp}</td>
                <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>{a.csat}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button style={S.btnGhost}>Export CSV</button>
          <button style={S.btnGhost}>Export PDF</button>
        </div>
      </div>
    </div>
  );
}
