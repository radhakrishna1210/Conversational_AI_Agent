import { useState, useEffect } from 'react';

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

type Status = 'Approved' | 'Pending' | 'Rejected';
const statusColor: Record<Status, { bg: string; text: string }> = {
  Approved: { bg: '#dcfce7', text: '#15803d' },
  Pending:  { bg: '#fef9c3', text: '#a16207' },
  Rejected: { bg: '#fee2e2', text: '#b91c1c' },
};

const categories = ['Marketing', 'Utility', 'Authentication'];

const mapStatus = (s: string): Status =>
  s === 'APPROVED' ? 'Approved' : s === 'REJECTED' ? 'Rejected' : 'Pending';

const mapCategory = (c: string): string =>
  c === 'MARKETING' ? 'Marketing' : c === 'UTILITY' ? 'Utility' : c === 'AUTHENTICATION' ? 'Authentication' : c;

export default function WHTemplates() {
  const [templates, setTemplates] = useState<{ name: string; category: string; lang: string; status: Status; preview: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  useEffect(() => {
    const workspaceId = localStorage.getItem('workspaceId') ?? '';
    const token = localStorage.getItem('token') ?? '';
    fetch(`/api/v1/workspaces/${workspaceId}/templates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: any[]) => {
        setTemplates(data.map(t => ({
          name: t.name,
          category: mapCategory(t.category),
          lang: t.language,
          status: mapStatus(t.status),
          preview: t.bodyText ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const [showModal, setShowModal] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCat, setTplCat] = useState('Marketing');
  const [tplBody, setTplBody] = useState('');

  const filtered = templates.filter(t =>
    (filterCat === 'All' || t.category === filterCat) &&
    (filterStatus === 'All' || t.status === filterStatus) &&
    (t.name.includes(search.toLowerCase()) || t.preview.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={S.page}>
      <div style={S.pageTitle}>📝 Template Management</div>
      <div style={S.pageSubtitle}>Create, manage, and track WhatsApp message templates across all categories.</div>

      {/* Create Template Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '560px', maxWidth: '90vw' }}>
            <div style={{ ...S.row, marginBottom: '20px' }}>
              <div style={{ fontSize: '17px', fontWeight: 700 }}>Create New Template</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={S.label}>Template Name</label>
                <input style={S.input} value={tplName} onChange={e => setTplName(e.target.value)} placeholder="e.g. order_shipped" />
              </div>
              <div>
                <label style={S.label}>Category</label>
                <select style={S.input} value={tplCat} onChange={e => setTplCat(e.target.value)}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Language</label>
                <select style={S.input}>
                  <option>English</option><option>Hindi</option><option>Tamil</option><option>Spanish</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Type</label>
                <select style={S.input}>
                  <option>Text</option><option>Media (Image)</option><option>Media (Video)</option><option>Carousel</option><option>With Buttons</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={S.label}>Message Body</label>
              <textarea style={{ ...S.input, resize: 'vertical', minHeight: '100px' }} value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Hello {{1}}, your order {{2}} is confirmed. Track here: {{3}}" />
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Use {'{{1}}'}, {'{{2}}'} etc. for dynamic variables.</div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={S.label}>Variable Mapping</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {['{{1}} → Customer Name', '{{2}} → Order ID', '{{3}} → Tracking URL'].map(v => (
                  <span key={v} style={{ backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', color: '#475569' }}>{v}</span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={S.btnGreen} onClick={() => setShowModal(false)}>Submit for Approval</button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ ...S.row, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
          <input style={{ ...S.input, maxWidth: '240px' }} placeholder="🔍 Search templates…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...S.input, width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option>All</option>{categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <select style={{ ...S.input, width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option>All</option><option>Approved</option><option>Pending</option><option>Rejected</option>
          </select>
        </div>
        <button style={S.btnGreen} onClick={() => setShowModal(true)}>+ Create Template</button>
      </div>

      {/* Template Cards */}
      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>Loading templates…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: '14px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          No templates yet. Create your first template to get started.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
        {filtered.map((t, i) => {
          const sc = statusColor[t.status];
          return (
            <div key={i} style={{ ...S.card, marginBottom: 0 }}>
              <div style={{ ...S.row, marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{t.name}</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{t.category}</span>
                    <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{t.lang}</span>
                  </div>
                </div>
                <span style={{ backgroundColor: sc.bg, color: sc.text, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{t.status}</span>
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '12px', fontSize: '13px', color: '#475569', fontStyle: 'italic', marginBottom: '12px' }}>"{t.preview}"</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={S.btnGhost}>Edit</button>
                <button style={S.btnGhost}>Duplicate</button>
                <button style={{ ...S.btnGhost, color: '#ef4444', borderColor: '#fecaca' }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
