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
  btnGhost: { backgroundColor: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' },
  btnDanger: { backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' },
  memberRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9' },
};

const members = [
  { name: 'Priya Sharma', email: 'priya@company.com', role: 'Admin', avatar: 'PS' },
  { name: 'Rohan Mehta', email: 'rohan@company.com', role: 'Agent', avatar: 'RM' },
  { name: 'Dev Patel', email: 'dev@company.com', role: 'Agent', avatar: 'DP' },
  { name: 'Sana Iyer', email: 'sana@company.com', role: 'Viewer', avatar: 'SI' },
];

const invoices = [
  { date: 'Mar 1, 2026', plan: 'Pro Plan', amount: '₹3,499', status: 'Paid' },
  { date: 'Dec 1, 2025', plan: 'Pro Plan', amount: '₹3,499', status: 'Paid' },
  { date: 'Sep 1, 2025', plan: 'Starter Plan', amount: '₹1,799', status: 'Paid' },
];

const Toggle = ({ label, desc, defaultOn = false }: { label: string; desc?: string; defaultOn?: boolean }) => {
  const [on, setOn] = useState(defaultOn);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{label}</div>
        {desc && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{desc}</div>}
      </div>
      <div onClick={() => setOn(!on)} style={{ width: '40px', height: '22px', borderRadius: '11px', backgroundColor: on ? '#10b981' : '#e2e8f0', cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: on ? '20px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
    </div>
  );
};

export default function WHSettings() {
  const [webhookUrl, setWebhookUrl] = useState('https://yourserver.com/webhooks/whatsapp');
  const [ratePct] = useState(62);

  return (
    <div style={S.page}>
      <div style={S.pageTitle}>⚙️ Settings</div>
      <div style={S.pageSubtitle}>Manage your workspace configuration, team members, billing, and preferences.</div>

      {/* Webhook */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Webhook Configuration</div>
        <label style={S.label}>Webhook URL</label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input style={S.input} value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
          <button style={S.btnGreen}>Save</button>
          <button style={S.btnGhost}>Send Test</button>
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>Verify Token: <code style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', color: '#8b5cf6', fontFamily: 'monospace' }}>token_k8pXm3wQ2n</code></div>
      </div>

      {/* API Rate Limit */}
      <div style={S.card}>
        <div style={S.sectionTitle}>API Rate Limit Monitor</div>
        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#475569' }}>
          <span>Daily usage</span><span style={{ fontWeight: 700, color: ratePct > 80 ? '#ef4444' : '#1e293b' }}>{ratePct}% of 5,000 messages</span>
        </div>
        <div style={{ height: '10px', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${ratePct}%`, backgroundColor: ratePct > 80 ? '#ef4444' : ratePct > 60 ? '#f59e0b' : '#10b981', borderRadius: '5px', transition: 'width 0.5s' }} />
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>{5000 - Math.round(5000 * ratePct / 100)} messages remaining today</div>
      </div>

      {/* Team Members */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '16px' }}>
          <div style={S.sectionTitle}>Team Members & Permissions</div>
          <button style={S.btnGreen}>+ Invite Member</button>
        </div>

        {members.map((m, i) => (
          <div key={i} style={S.memberRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#1e4034', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>{m.avatar}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{m.email}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', outline: 'none', backgroundColor: '#f8fafc', color: '#374151' }} defaultValue={m.role}>
                <option>Admin</option><option>Agent</option><option>Viewer</option>
              </select>
              <button style={S.btnDanger}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      {/* Billing & Invoices */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '16px' }}>
          <div style={S.sectionTitle}>Billing & Invoices</div>
          <button style={S.btnGhost}>Upgrade Plan</button>
        </div>

        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803d' }}>Pro Plan — ₹3,499 / quarter</div>
            <div style={{ fontSize: '12px', color: '#16a34a' }}>Next billing date: Jun 1, 2026</div>
          </div>
          <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>Active</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ backgroundColor: '#f8fafc' }}>
            {['Date', 'Plan', 'Amount', 'Status', ''].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={i}>
                <td style={{ padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{inv.date}</td>
                <td style={{ padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}>{inv.plan}</td>
                <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{inv.amount}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{inv.status}</span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <button style={{ ...S.btnGhost, padding: '4px 10px', fontSize: '12px' }}>Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notification Preferences */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Notification Preferences</div>
        <Toggle label="New Conversation" desc="Notify when a new chat starts" defaultOn={true} />
        <Toggle label="Template Approved/Rejected" desc="Meta approval status updates" defaultOn={true} />
        <Toggle label="Campaign Completed" desc="When a bulk send finishes" defaultOn={true} />
        <Toggle label="High Opt-out Alert" desc="Alert when opt-out rate exceeds 1%" />
        <Toggle label="Rate Limit Warning" desc="Alert at 80% daily API usage" defaultOn={true} />
      </div>
    </div>
  );
}
