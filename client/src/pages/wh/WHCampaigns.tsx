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
  statCard: { backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px 20px', border: '1px solid #e2e8f0', textAlign: 'center' as const },
};

type Campaign = { id: string; name: string; template: string; contacts: number; sent: number; delivered: number; read: number; failed: number; status: string; date: string };
type ApprovedTemplate = { id: string; name: string };
type Contact = { id: string; name: string | null; phoneNumber: string };

const fmtStatus = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase();

export default function WHCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<ApprovedTemplate[]>([]);
  const [stats, setStats] = useState({ sent: 0, delivered: 0, read: 0, failed: 0 });
  const [step, setStep] = useState(1);

  // Step 1 — contact selection
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactTab, setContactTab] = useState<'existing' | 'add' | 'csv'>('existing');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [addContactError, setAddContactError] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; updated: number } | null>(null);
  const [csvError, setCsvError] = useState('');

  // Step 2
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Step 4
  const [campaignName, setCampaignName] = useState('');
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');

  const workspaceId = localStorage.getItem('workspaceId') ?? '';
  const token = localStorage.getItem('token') ?? '';
  const authHeaders: HeadersInit = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadContacts = (search = '') => {
    fetch(`/api/v1/workspaces/${workspaceId}/contacts?search=${encodeURIComponent(search)}`, {
      headers: authHeaders,
    })
      .then(r => r.json())
      .then((res: any) => setContacts(res.data ?? []))
      .catch(() => {});
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddContact = async () => {
    if (!newPhone.trim()) { setAddContactError('Phone number is required.'); return; }
    setAddingContact(true);
    setAddContactError('');
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/contacts`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ phoneNumber: newPhone.trim(), name: newName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setAddContactError(data.error ?? 'Failed to add contact.'); return; }
      setNewName(''); setNewPhone('');
      loadContacts(contactSearch);
      setSelectedIds(prev => new Set(prev).add(data.id));
      setContactTab('existing');
    } catch { setAddContactError('Network error.'); }
    finally { setAddingContact(false); }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvError('');
    setCsvResult(null);
    try {
      const form = new FormData();
      form.append('file', csvFile);
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/contacts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { setCsvError(data.error ?? 'Upload failed.'); return; }
      setCsvResult({ created: data.created ?? 0, updated: data.updated ?? 0 });
      setCsvFile(null);
      loadContacts();
      setContactTab('existing');
    } catch { setCsvError('Network error.'); }
    finally { setCsvUploading(false); }
  };

  const handleLaunch = async () => {
    if (!campaignName.trim()) { setLaunchError('Campaign name is required.'); return; }
    if (!selectedTemplateId) { setLaunchError('Please go back and select a template.'); return; }
    if (selectedIds.size === 0) { setLaunchError('Please go back and select at least one contact.'); return; }
    setLaunching(true);
    setLaunchError('');
    try {
      // 1. Get whatsapp number ID
      const numRes = await fetch(`/api/v1/workspaces/${workspaceId}/whatsapp/numbers`, { headers: authHeaders });
      const numData = await numRes.json();
      if (!numRes.ok || !numData?.length) { setLaunchError('No WhatsApp number connected to this workspace.'); return; }
      const whatsappNumberId = numData[0].id;

      // 2. Create campaign
      const createRes = await fetch(`/api/v1/workspaces/${workspaceId}/campaigns`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: campaignName.trim(), templateId: selectedTemplateId, whatsappNumberId }),
      });
      const campaign = await createRes.json();
      if (!createRes.ok) { setLaunchError(campaign.error ?? 'Failed to create campaign.'); return; }

      // 3. Add recipients
      const recipRes = await fetch(`/api/v1/workspaces/${workspaceId}/campaigns/${campaign.id}/recipients`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
      });
      if (!recipRes.ok) { setLaunchError('Failed to add recipients.'); return; }

      // 4. Launch
      const launchBody: Record<string, string> = {};
      if (!scheduleNow && scheduledAt) launchBody.scheduledAt = new Date(scheduledAt).toISOString();
      const launchRes = await fetch(`/api/v1/workspaces/${workspaceId}/campaigns/${campaign.id}/launch`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(launchBody),
      });
      const launchData = await launchRes.json();
      if (!launchRes.ok) { setLaunchError(launchData.error ?? 'Failed to launch campaign.'); return; }

      // Success — reset wizard, reload campaigns
      setStep(1);
      setSelectedIds(new Set());
      setSelectedTemplateId('');
      setCampaignName('');
      setScheduleNow(true);
      setScheduledAt('');

      // Reload campaign list
      const h: HeadersInit = { Authorization: `Bearer ${token}` };
      fetch(`/api/v1/workspaces/${workspaceId}/campaigns`, { headers: h })
        .then(r => r.json())
        .then((data: any[]) => {
          const mapped: Campaign[] = data.map(c => ({
            id: c.id, name: c.name, template: c.template?.name ?? '—',
            contacts: c.totalContacts, sent: c.sent, delivered: c.delivered,
            read: c.read, failed: c.failed, status: fmtStatus(c.status),
            date: c.launchedAt ? new Date(c.launchedAt).toLocaleDateString() : '—',
          }));
          setCampaigns(mapped);
        })
        .catch(() => {});
    } catch { setLaunchError('Network error. Please try again.'); }
    finally { setLaunching(false); }
  };

  useEffect(() => {
    const workspaceId = localStorage.getItem('workspaceId') ?? '';
    const token = localStorage.getItem('token') ?? '';
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };

    fetch(`/api/v1/workspaces/${workspaceId}/campaigns`, { headers })
      .then(r => r.json())
      .then((data: any[]) => {
        const mapped: Campaign[] = data.map(c => ({
          id: c.id,
          name: c.name,
          template: c.template?.name ?? '—',
          contacts: c.totalContacts,
          sent: c.sent,
          delivered: c.delivered,
          read: c.read,
          failed: c.failed,
          status: fmtStatus(c.status),
          date: c.launchedAt ? new Date(c.launchedAt).toLocaleDateString() : '—',
        }));
        setCampaigns(mapped);
        const totals = mapped.reduce((a, c) => ({
          sent: a.sent + c.sent, delivered: a.delivered + c.delivered,
          read: a.read + c.read, failed: a.failed + c.failed,
        }), { sent: 0, delivered: 0, read: 0, failed: 0 });
        setStats(totals);
      })
      .catch(() => {});

    fetch(`/api/v1/workspaces/${workspaceId}/templates?status=APPROVED`, { headers })
      .then(r => r.json())
      .then((data: any[]) => setApprovedTemplates(data.map(t => ({ id: t.id, name: t.name }))))
      .catch(() => {});

    loadContacts();
  }, []);

  return (
    <div style={S.page}>
      <div style={S.pageTitle}>📤 Bulk Messaging / Campaigns</div>
      <div style={S.pageSubtitle}>Upload contacts, select templates, schedule campaigns, and track performance in real time.</div>

      {/* Campaign Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Total Sent', num: stats.sent.toLocaleString(), color: '#3b82f6' },
          { label: 'Delivered', num: stats.delivered.toLocaleString(), color: '#10b981' },
          { label: 'Read', num: stats.read.toLocaleString(), color: '#8b5cf6' },
          { label: 'Failed', num: stats.failed.toLocaleString(), color: '#ef4444' },
        ].map((s, i) => (
          <div key={i} style={S.statCard}>
            <div style={{ fontSize: '26px', fontWeight: 800, color: s.color, marginBottom: '4px' }}>{s.num}</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Create Campaign Wizard */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div style={S.sectionTitle}>Create New Campaign</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[1, 2, 3].map(n => (
              <div key={n} onClick={() => setStep(n)} style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, cursor: 'pointer', backgroundColor: step === n ? '#1e4034' : step > n ? '#10b981' : '#f1f5f9', color: step >= n ? '#fff' : '#94a3b8' }}>{step > n ? '✓' : n}</div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#374151' }}>Step 1 — Select Contacts</div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
              {([
                { key: 'existing', label: `Existing Contacts${selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}` },
                { key: 'add',      label: '+ Add New Contact' },
                { key: 'csv',      label: 'CSV Upload' },
              ] as { key: 'existing' | 'add' | 'csv'; label: string }[]).map(tab => (
                <button key={tab.key} onClick={() => setContactTab(tab.key)} style={{ background: 'none', border: 'none', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: contactTab === tab.key ? '#10b981' : '#64748b', borderBottom: contactTab === tab.key ? '2px solid #10b981' : '2px solid transparent' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Existing Contacts */}
            {contactTab === 'existing' && (
              <div>
                <input
                  style={{ ...S.input, marginBottom: '10px' }}
                  placeholder="Search by name or phone…"
                  value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); loadContacts(e.target.value); }}
                />
                <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  {contacts.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contacts yet. Add one using the tab above.</div>
                  )}
                  {contacts.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: selectedIds.has(c.id) ? '#f0fdf4' : 'transparent' }}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ accentColor: '#10b981', width: '16px', height: '16px' }} />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{c.name ?? '—'}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{c.phoneNumber}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedIds.size > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#10b981', fontWeight: 600 }}>{selectedIds.size} contact{selectedIds.size > 1 ? 's' : ''} selected</div>
                )}
              </div>
            )}

            {/* Add New Contact */}
            {contactTab === 'add' && (
              <div style={{ maxWidth: '400px' }}>
                {addContactError && <div style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '12px' }}>{addContactError}</div>}
                <div style={{ marginBottom: '12px' }}>
                  <label style={S.label}>Name <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                  <input style={S.input} placeholder="e.g. John Doe" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={S.label}>Phone Number <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={S.input} placeholder="e.g. 919876543210" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Digits only with country code, no + or spaces.</div>
                </div>
                <button
                  style={{ ...S.btnGreen, opacity: addingContact ? 0.7 : 1 }}
                  disabled={addingContact}
                  onClick={handleAddContact}
                >
                  {addingContact ? 'Saving…' : 'Save Contact'}
                </button>
              </div>
            )}

            {/* CSV Upload */}
            {contactTab === 'csv' && (
              <div style={{ maxWidth: '480px' }}>
                {csvError && <div style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '12px' }}>{csvError}</div>}
                {csvResult && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 14px', color: '#15803d', fontSize: '13px', marginBottom: '12px' }}>
                    Import complete — {csvResult.created} created, {csvResult.updated} updated. Contacts are now in your list.
                  </div>
                )}
                <div
                  style={{ border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '32px', textAlign: 'center', backgroundColor: '#f8fafc', marginBottom: '14px', cursor: 'pointer' }}
                  onClick={() => document.getElementById('csv-input')?.click()}
                >
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📂</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                    {csvFile ? csvFile.name : 'Click to choose a CSV file'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>Required columns: <code>phone</code> — optional: <code>name</code>, <code>email</code></div>
                  <input id="csv-input" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { setCsvFile(e.target.files?.[0] ?? null); setCsvResult(null); setCsvError(''); }} />
                </div>
                <button
                  style={{ ...S.btnGreen, opacity: (!csvFile || csvUploading) ? 0.5 : 1 }}
                  disabled={!csvFile || csvUploading}
                  onClick={handleCsvUpload}
                >
                  {csvUploading ? 'Uploading…' : 'Upload & Import'}
                </button>
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <button style={{ ...S.btnGreen, opacity: selectedIds.size === 0 ? 0.5 : 1 }} disabled={selectedIds.size === 0} onClick={() => setStep(2)}>
                Next: Choose Template →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#374151' }}>Step 2 — Select Approved Template</div>
            {approvedTemplates.length === 0 && <div style={{ color: '#94a3b8', fontSize: '13px', padding: '8px 0' }}>No approved templates yet. Create and get a template approved first.</div>}
            {approvedTemplates.map((t) => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', border: `1px solid ${selectedTemplateId === t.id ? '#10b981' : '#e2e8f0'}`, borderRadius: '8px', padding: '14px', marginBottom: '10px', cursor: 'pointer', backgroundColor: selectedTemplateId === t.id ? '#f0fdf4' : '#fff' }}>
                <input type="radio" name="template" checked={selectedTemplateId === t.id} onChange={() => setSelectedTemplateId(t.id)} style={{ accentColor: '#10b981' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'monospace' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Approved • English</div>
                </div>
              </label>
            ))}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={S.btnGhost} onClick={() => setStep(1)}>← Back</button>
              <button style={{ ...S.btnGreen, opacity: selectedTemplateId ? 1 : 0.5 }} disabled={!selectedTemplateId} onClick={() => setStep(3)}>Next: Schedule →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#374151' }}>Step 3 — Schedule & Launch</div>
            {launchError && <div style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '14px' }}>{launchError}</div>}
            <div style={{ marginBottom: '16px' }}>
              <label style={S.label}>Campaign Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={S.input} placeholder="Spring Sale 2026" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              {[{ label: 'Send Immediately', now: true }, { label: 'Schedule for Later', now: false }].map(opt => (
                <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', border: `1px solid ${scheduleNow === opt.now ? '#10b981' : '#e2e8f0'}`, borderRadius: '8px', padding: '12px 20px', backgroundColor: scheduleNow === opt.now ? '#f0fdf4' : '#fff' }}>
                  <input type="radio" name="schedule" checked={scheduleNow === opt.now} onChange={() => setScheduleNow(opt.now)} style={{ accentColor: '#10b981' }} /> {opt.label}
                </label>
              ))}
            </div>
            {!scheduleNow && (
              <div style={{ marginBottom: '16px' }}>
                <label style={S.label}>Schedule Date & Time</label>
                <input type="datetime-local" style={S.input} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              </div>
            )}
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              <strong>{selectedIds.size}</strong> contact{selectedIds.size !== 1 ? 's' : ''} · template: <code style={{ backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{approvedTemplates.find(t => t.id === selectedTemplateId)?.name ?? '—'}</code>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={S.btnGhost} onClick={() => setStep(2)}>← Back</button>
              <button
                style={{ ...S.btnGreen, opacity: launching ? 0.6 : 1 }}
                disabled={launching}
                onClick={handleLaunch}
              >
                {launching ? 'Launching…' : '🚀 Launch Campaign'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Campaign Table */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Campaign History</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ backgroundColor: '#f8fafc' }}>
            {['Campaign', 'Template', 'Contacts', 'Sent', 'Delivered', 'Read', 'Failed', 'Status'].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No campaigns yet.</td></tr>
            )}
            {campaigns.map((c, i) => (
              <tr key={i} style={{ cursor: 'pointer' }} onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{c.name}</td>
                <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace', color: '#6366f1', borderBottom: '1px solid #f1f5f9' }}>{c.template}</td>
                <td style={{ padding: '12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}>{c.contacts.toLocaleString()}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#3b82f6', borderBottom: '1px solid #f1f5f9' }}>{c.sent.toLocaleString()}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#10b981', borderBottom: '1px solid #f1f5f9' }}>{c.delivered.toLocaleString()}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#8b5cf6', borderBottom: '1px solid #f1f5f9' }}>{c.read.toLocaleString()}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: c.failed > 0 ? '#ef4444' : '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{c.failed}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ backgroundColor: c.status === 'Completed' ? '#dcfce7' : '#fef9c3', color: c.status === 'Completed' ? '#15803d' : '#a16207', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Opt-out management */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Opt-out / Unsubscribe Management</div>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' as const }}>
          <div style={{ flex: 1, minWidth: '200px', backgroundColor: '#fff7ed', borderRadius: '8px', padding: '16px', border: '1px solid #fed7aa' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#ea580c' }}>—</div>
            <div style={{ fontSize: '13px', color: '#9a3412' }}>Total Opt-outs (this month)</div>
          </div>
          <div style={{ flex: 1, minWidth: '200px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a' }}>—</div>
            <div style={{ fontSize: '13px', color: '#15803d' }}>Opt-in rate across contacts</div>
          </div>
          <div style={{ flex: 2, minWidth: '280px', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#374151' }}>Hotword to Opt-out</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ ...S.input, flex: 1 }} defaultValue="STOP" />
              <button style={S.btnGhost}>Update</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
