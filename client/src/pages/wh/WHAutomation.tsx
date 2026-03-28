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
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' },
};

const triggers: { keyword: string; reply: string; active: boolean }[] = [];

const integrations: { name: string; icon: string; desc: string; connected: boolean }[] = [];

const FlowNode = ({ label, color, icon }: { label: string; color: string; icon: string }) => (
  <div style={{ backgroundColor: '#fff', border: `2px solid ${color}`, borderRadius: '8px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
    <span>{icon}</span> {label}
  </div>
);

const Arrow = () => <div style={{ width: '2px', height: '20px', backgroundColor: '#cbd5e1', margin: '0 auto' }} />;

export default function WHAutomation() {
  const [triggerList, setTriggerList] = useState(triggers);

  const toggle = (idx: number) => setTriggerList(prev => prev.map((t, i) => i === idx ? { ...t, active: !t.active } : t));

  return (
    <div style={S.page}>
      <div style={S.pageTitle}>🤖 Automation / Chatbot Builder</div>
      <div style={S.pageSubtitle}>Set up keyword triggers, build visual flows, and connect to external tools.</div>

      {/* Visual Flow Builder Preview */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>Visual Flow Builder</div>
          <button style={S.btnGreen}>🎨 Open Builder</button>
        </div>
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '28px', border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <FlowNode label="User sends message" color="#3b82f6" icon="💬" />
          <Arrow />
          <FlowNode label="Keyword Match: 'HELP'" color="#8b5cf6" icon="🔍" />
          <Arrow />
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>MATCH</div>
              <FlowNode label="Send Menu Reply" color="#10b981" icon="📤" />
              <Arrow />
              <FlowNode label="Wait 30s" color="#f59e0b" icon="⏱" />
              <Arrow />
              <FlowNode label="Assign to Agent" color="#ef4444" icon="👤" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>NO MATCH</div>
              <FlowNode label="Default Reply" color="#64748b" icon="💬" />
            </div>
          </div>
        </div>
      </div>

      {/* Keyword Triggers */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>Keyword Triggers</div>
          <button style={S.btnGreen}>+ Add Trigger</button>
        </div>

        {triggerList.map((t, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ ...S.row, marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>{t.keyword}</span>
                <span style={{ fontSize: '13px', color: '#64748b' }}>→ auto-reply</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div onClick={() => toggle(i)} style={{ width: '36px', height: '20px', borderRadius: '10px', backgroundColor: t.active ? '#10b981' : '#e2e8f0', cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: t.active ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
                <button style={S.btnGhost}>Edit</button>
                <button style={{ ...S.btnGhost, color: '#ef4444', borderColor: '#fecaca' }}>Delete</button>
              </div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '10px 12px', fontSize: '13px', color: '#475569', whiteSpace: 'pre-line' }}>{t.reply}</div>
          </div>
        ))}
      </div>

      {/* Integrations */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Integrations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
          {integrations.map((intg, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', textAlign: 'center' as const }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{intg.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{intg.name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px', lineHeight: 1.4 }}>{intg.desc}</div>
              <button style={{ ...S.btnGhost, width: '100%', backgroundColor: intg.connected ? '#f0fdf4' : 'transparent', borderColor: intg.connected ? '#bbf7d0' : '#e2e8f0', color: intg.connected ? '#15803d' : '#475569', fontSize: '12px', padding: '6px 10px' }}>{intg.connected ? '✓ Connected' : 'Connect'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
