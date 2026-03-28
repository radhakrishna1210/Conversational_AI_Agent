import { useState } from 'react';

const S = {
  page: { padding: '28px', maxWidth: '960px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b' },
  pageTitle: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#1e293b' },
  pageSubtitle: { fontSize: '14px', color: '#64748b', marginBottom: '28px' },
  card: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', marginBottom: '20px' },
  sectionTitle: { fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' },
  input: { width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px', fontSize: '14px', color: '#1e293b', outline: 'none', boxSizing: 'border-box' as const, backgroundColor: '#f8fafc' },
  btnGreen: { backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  btnGhost: { backgroundColor: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' },
  mono: { fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: '13px', backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', color: '#0f172a', wordBreak: 'break-all' as const },
  statCard: { backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px 20px', border: '1px solid #e2e8f0', textAlign: 'center' as const },
  statNum: { fontSize: '28px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' },
  statLabel: { fontSize: '13px', color: '#64748b' },
};

const keys: { name: string; key: string; created: string; status: string }[] = [];


export default function WHApiManagement() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState('');

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div style={S.page}>
      <div style={S.pageTitle}>🔑 API Management</div>
      <div style={S.pageSubtitle}>Manage your API keys, configure webhooks, monitor usage, and test the API playground.</div>

      {/* Usage Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Messages Sent', num: '—', color: '#10b981' },
          { label: 'Messages Received', num: '—', color: '#3b82f6' },
          { label: 'Delivery Rate', num: '—', color: '#8b5cf6' },
          { label: 'Rate Limit Used', num: '—', color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={S.statCard}>
            <div style={{ ...S.statNum, color: s.color }}>{s.num}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* API Keys */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>API Keys</div>
          <button style={S.btnGreen}>+ Generate New Key</button>
        </div>

        {keys.map((k, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ ...S.row, marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{k.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Created {k.created}</div>
              </div>
              <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{k.status}</span>
            </div>
            <div style={S.mono}>{k.key}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={S.btnGhost} onClick={() => copy(k.key, `key-${i}`)}>{copied === `key-${i}` ? '✓ Copied' : 'Copy'}</button>
              <button style={S.btnGhost}>Rotate</button>
              <button style={{ ...S.btnGhost, color: '#ef4444', borderColor: '#fecaca' }}>Revoke</button>
            </div>
          </div>
        ))}
      </div>

      {/* Webhook Configuration */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Webhook Configuration</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Receive real-time events for incoming messages, delivery receipts, and status updates.</div>

        <label style={S.label}>Webhook URL</label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input style={S.input} value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
          <button style={S.btnGreen}>Save</button>
          <button style={S.btnGhost}>Test</button>
        </div>

        <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#475569' }}>Subscribed Events</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
            {['messages', 'message_reactions', 'message_deliveries', 'message_reads', 'messaging_referrals'].map(ev => (
              <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: '#10b981' }} /> {ev}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Usage Bars */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Daily Usage (Last 7 Days)</div>
        <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No usage data available</div>
      </div>

      {/* API Playground */}
      <div style={S.card}>
        <div style={S.sectionTitle}>API Playground — Send Test Message</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={S.label}>To (Phone Number)</label>
            <input style={S.input} placeholder="+91 98765 43210" />
          </div>
          <div>
            <label style={S.label}>Template ID</label>
            <input style={S.input} placeholder="hello_world" />
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={S.label}>Message Body (Text)</label>
          <textarea style={{ ...S.input, resize: 'vertical', minHeight: '80px' }} placeholder="Hello {{1}}, your order {{2}} is on its way!" />
        </div>
        <button style={S.btnGreen}>📤 Send Test Message</button>
      </div>
    </div>
  );
}
