import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const S = {
  // --- New Layout Styles ---
  page: { backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b' },
  headerArea: { padding: '16px 24px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  titleGroup: { display: 'flex', alignItems: 'center', gap: '12px' },
  pageTitle: { fontSize: '20px', fontWeight: 600, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' },
  infoIcon: { color: '#94a3b8', fontSize: '14px', cursor: 'pointer' },
  statusBadgeContainer: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' },
  statusBadge: { backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' },
  statusDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#15803d' },
  notifLink: { color: '#0ea5e9', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' },
  
  btnGroup: { display: 'flex', alignItems: 'center', gap: '12px' },
  btnGhostHeader: { backgroundColor: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },
  btnDarkGreen: { backgroundColor: '#115e59', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },

  toolbar: { padding: '16px 24px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' as const, borderBottom: '1px solid #e2e8f0' },
  searchBox: { display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px', width: '240px', backgroundColor: '#f8fafc' },
  searchInput: { border: 'none', outline: 'none', fontSize: '13px', width: '100%', marginLeft: '6px', backgroundColor: 'transparent', color: '#1e293b' },
  
  filterGroup: { display: 'flex', alignItems: 'center', gap: '16px' },
  filterItem: { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '13px', cursor: 'pointer' },
  filterVal: { color: '#115e59', fontWeight: 600 },

  tabsContainer: { display: 'flex', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0' },
  tabItem: { padding: '16px 24px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', color: '#64748b', borderBottom: '2px solid transparent' },
  tabActive: { color: '#115e59', borderBottom: '2px solid #115e59', fontWeight: 600, backgroundColor: '#f0fdf4' },

  tableContainer: { padding: '0', backgroundColor: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { padding: '16px 24px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const },
  td: { padding: '16px 24px', fontSize: '13px', color: '#1e293b', borderBottom: '1px solid #f1f5f9' },
  
  badgeCompleted: { backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, display: 'inline-block' },

  footer: { padding: '16px 24px', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  paginationInfo: { fontSize: '13px', color: '#64748b' },
  paginationNav: { display: 'flex', alignItems: 'center', gap: '4px' },
  pageBtn: { background: 'none', border: 'none', padding: '4px 10px', fontSize: '13px', color: '#64748b', cursor: 'pointer' },
  pageBtnActive: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', fontWeight: 600, color: '#115e59' },

  helpBtn: { position: 'fixed' as const, bottom: '24px', right: '24px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '20px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', display: 'flex', alignItems: 'center', gap: '6px' },

  // --- Modal Styles ---
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '850px', height: '600px', backgroundColor: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalBody: { display: 'flex', flex: 1, overflow: 'hidden' },
  modalLeft: { width: '320px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' as const },
  modalRight: { flex: 1, display: 'flex', flexDirection: 'column' as const, backgroundColor: '#f8fafc', position: 'relative' as const },
  
  // --- Wizard Styles (retained from original for when user clicks Create Campaign) ---
  wizardPage: { padding: '28px', maxWidth: '960px', margin: '0 auto' },
  wizardSubtitle: { fontSize: '14px', color: '#64748b', marginBottom: '28px' },
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
type ApprovedTemplate = { id: string; name: string; body: string };
type Contact = { id: string; name: string | null; phoneNumber: string };

const SAMPLE_TEMPLATES = [
  { name: 'Welcome Message',       cat: 'Utility',         preview: 'Hi {{1}} 👋\n\nWelcome to our service! We\'re glad to have you on board.\n\nReply HELP at any time for support.' },
  { name: 'Order Confirmation',    cat: 'Utility',         preview: 'Hi {{1}},\n\nYour order #{{2}} is confirmed ✅\n\nEstimated delivery: {{3}}\nTrack here: {{4}}' },
  { name: 'Flash Sale Alert',      cat: 'Marketing',       preview: '🎉 Flash Sale!\n\nHi {{1}}, get {{2}}% OFF today only!\n\nShop now: {{3}}\n\nReply STOP to opt out.' },
  { name: 'Appointment Reminder',  cat: 'Utility',         preview: 'Hi {{1}},\n\nReminder: your appointment is on {{2}} at {{3}}.\n\nReply CONFIRM to confirm or RESCHEDULE to change.' },
  { name: 'Product Launch',        cat: 'Marketing',       preview: '🚀 Just Launched!\n\nHi {{1}}, we\'re excited to introduce {{2}}.\n\nBe the first to explore: {{3}}' },
  { name: 'Feedback Request',      cat: 'Marketing',       preview: 'Hi {{1}},\n\nThank you for choosing us! How was your experience? ⭐\n\nShare feedback: {{2}}' },
  { name: 'Shipping Update',       cat: 'Utility',         preview: 'Hi {{1}},\n\nYour order #{{2}} is out for delivery 🚚\n\nETA: {{3}}\nTrack live: {{4}}' },
  { name: 'Payment Reminder',      cat: 'Utility',         preview: 'Hi {{1}},\n\nYour payment of ₹{{2}} is due on {{3}}.\n\nPay now to avoid late charges: {{4}}' },
  { name: 'Restock Alert',         cat: 'Marketing',       preview: '🔔 Back in Stock!\n\nHi {{1}}, {{2}} is available again.\n\nGrab yours before it sells out: {{3}}' },
  { name: 'Account OTP',           cat: 'Authentication',  preview: 'Hi {{1}},\n\nYour OTP is {{2}}. It expires in 10 minutes.\n\nDo not share this code with anyone.' },
];

const fmtStatus = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const getPerc = (part: number, total: number) => {
  if (!total) return '--';
  return Math.round((part / total) * 100) + '%';
};

export default function WHCampaigns() {
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('Sample Ideas');
  const [activeTab, setActiveTab] = useState('One Time Campaigns');
  const [selectedSampleIdx, setSelectedSampleIdx] = useState(0);
  const [selectedApprovedId, setSelectedApprovedId] = useState('');

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
  const [templateBody, setTemplateBody] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'Approved Templates' | 'Sample Ideas'>('Approved Templates');

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

      // Success
      setStep(1);
      setSelectedIds(new Set());
      setSelectedTemplateId('');
      setTemplateBody('');
      setShowTemplatePicker(false);
      setPickerTab('Approved Templates');
      setCampaignName('');
      setScheduleNow(true);
      setScheduledAt('');
      setShowWizard(false); // Go back to list after launch

      // Reload campaign list
      const h: HeadersInit = { Authorization: `Bearer ${token}` };
      fetch(`/api/v1/workspaces/${workspaceId}/campaigns`, { headers: h })
        .then(r => r.json())
        .then((data: any[]) => {
          const mapped: Campaign[] = data.map(c => ({
            id: c.id, name: c.name, template: c.template?.name ?? '—',
            contacts: c.totalContacts, sent: c.sent, delivered: c.delivered,
            read: c.read, failed: c.failed, status: fmtStatus(c.status),
            date: c.launchedAt ? new Date(c.launchedAt).toLocaleDateString('en-GB') : '--',
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
          date: c.launchedAt ? new Date(c.launchedAt).toLocaleDateString('en-GB') : '--', // formats as DD/MM/YYYY
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
      .then((data: any[]) => setApprovedTemplates(data.map(t => ({ id: t.id, name: t.name, body: t.bodyText ?? '' }))))
      .catch(() => {});

    loadContacts();
  }, []);

  void stats; // stats is populated by setStats in useEffect; retained for future analytics display

  // Derived: which approved template is selected (has a real API id)
  const isSampleSelected = selectedTemplateId.startsWith('sample_');
  const sampleIdx = isSampleSelected ? parseInt(selectedTemplateId.replace('sample_', ''), 10) : -1;
  const selectedSampleTpl = sampleIdx >= 0 ? SAMPLE_TEMPLATES[sampleIdx] : null;
  const selectedApprovedTpl = !isSampleSelected ? approvedTemplates.find(t => t.id === selectedTemplateId) : null;
  const canProceedStep2 = !!selectedApprovedTpl && !showTemplatePicker;

  const catColor = (cat: string) =>
    cat === 'Marketing' ? '#ea580c' : cat === 'Authentication' ? '#7c3aed' : '#0891b2';

  if (showWizard) {
    return (
      <div style={S.wizardPage}>
        <div style={{...S.pageTitle, marginBottom: '20px'}}>
          <button style={{...S.btnGhost, padding: '6px 10px', marginRight: '10px'}} onClick={() => setShowWizard(false)}>←</button>
          Create Campaign
        </div>
        <div style={S.wizardSubtitle}>Upload contacts, select templates, and schedule campaigns.</div>

        <div style={S.card}>
          <div style={{ ...S.row, marginBottom: '20px' }}>
            <div style={S.sectionTitle}>Campaign Wizard</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3].map(n => (
                <div key={n} onClick={() => setStep(n)} style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, cursor: 'pointer', backgroundColor: step === n ? '#115e59' : step > n ? '#10b981' : '#f1f5f9', color: step >= n ? '#fff' : '#94a3b8' }}>{step > n ? '✓' : n}</div>
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
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#374151' }}>
                Step 2 — {(!selectedTemplateId || showTemplatePicker) ? 'Choose a Template' : 'Template Content'}
              </div>

              {/* ── PICKER (shown when nothing is selected yet, or user clicked "Choose Another") ── */}
              {(!selectedTemplateId || showTemplatePicker) && (
                <div>
                  {/* Tab bar */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '12px' }}>
                    {(['Approved Templates', 'Sample Ideas'] as const).map(tab => (
                      <button key={tab} onClick={() => setPickerTab(tab)} style={{ background: 'none', border: 'none', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: pickerTab === tab ? '#10b981' : '#64748b', borderBottom: pickerTab === tab ? '2px solid #10b981' : '2px solid transparent' }}>
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Approved Templates list */}
                  {pickerTab === 'Approved Templates' && (
                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      {approvedTemplates.length === 0 ? (
                        <div style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', lineHeight: '1.6' }}>
                          No approved templates yet.<br />Go to the <strong>Templates</strong> page to create one.
                        </div>
                      ) : approvedTemplates.map(t => (
                        <div key={t.id} onClick={() => { setSelectedTemplateId(t.id); setTemplateBody(t.body); setShowTemplatePicker(false); }} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: selectedTemplateId === t.id ? '#f0fdf4' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: '#1e293b' }}>{t.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Approved · English</div>
                          </div>
                          <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, flexShrink: 0 }}>Approved</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sample Ideas list */}
                  {pickerTab === 'Sample Ideas' && (
                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      {SAMPLE_TEMPLATES.map((tpl, i) => {
                        const key = `sample_${i}`;
                        const cc = catColor(tpl.cat);
                        return (
                          <div key={i} onClick={() => { setSelectedTemplateId(key); setTemplateBody(tpl.preview); setShowTemplatePicker(false); }} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: selectedTemplateId === key ? '#f0fdf4' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{tpl.name}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Sample · English</div>
                            </div>
                            <span style={{ fontSize: '11px', color: cc, backgroundColor: cc + '1a', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, flexShrink: 0 }}>{tpl.cat}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Back link when re-picking (has an existing selection) */}
                  {showTemplatePicker && selectedTemplateId && (
                    <div style={{ marginTop: '10px' }}>
                      <button style={S.btnGhost} onClick={() => setShowTemplatePicker(false)}>← Back to template</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── EDITOR (shown when a template is selected and picker is closed) ── */}
              {selectedTemplateId && !showTemplatePicker && (
                <div>
                  {/* Header row: name + badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', fontFamily: isSampleSelected ? 'inherit' : 'monospace' }}>
                      {isSampleSelected ? selectedSampleTpl?.name : selectedApprovedTpl?.name}
                    </span>
                    {isSampleSelected
                      ? <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>Sample — reference only</span>
                      : <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>✓ Approved</span>
                    }
                  </div>

                  {/* Warning for sample templates */}
                  {isSampleSelected && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#92400e', marginBottom: '14px', lineHeight: '1.5' }}>
                      ⚠️ Samples are for reference only and cannot be sent directly. To proceed, switch to the <strong>Approved Templates</strong> tab and select a real template.
                    </div>
                  )}

                  {/* Editable body */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={S.label}>
                      Template Body
                      <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>(editable)</span>
                    </label>
                    <textarea
                      style={{ ...S.input, resize: 'vertical' as const, minHeight: '150px', fontFamily: 'inherit', lineHeight: '1.6' }}
                      value={templateBody}
                      onChange={e => setTemplateBody(e.target.value)}
                      placeholder="Template content will appear here…"
                    />
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      Variables like {'{{1}}'}, {'{{2}}'} will be replaced with actual values at send time.
                    </div>
                  </div>

                  {/* Choose another template */}
                  <button
                    style={{ ...S.btnGhost, display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => { setShowTemplatePicker(true); setPickerTab('Approved Templates'); }}
                  >
                    ↩ Choose Another Template
                  </button>
                </div>
              )}

              {/* Nav */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button style={S.btnGhost} onClick={() => { setStep(1); setShowTemplatePicker(false); }}>← Back</button>
                <button
                  style={{ ...S.btnGreen, opacity: canProceedStep2 ? 1 : 0.5 }}
                  disabled={!canProceedStep2}
                  onClick={() => setStep(3)}
                >
                  Next: Schedule →
                </button>
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
      </div>
    );
  }

  // List View (Matches the user provided image)
  return (
    <div style={S.page}>
      
      {/* Header Block */}
      <div style={S.headerArea}>
        <div style={S.titleGroup}>
          <h1 style={S.pageTitle}>Campaigns <span style={S.infoIcon}>ⓘ</span></h1>
          <div style={S.statusBadgeContainer}>
            Account Status: 
            <span style={S.statusBadge}><div style={S.statusDot}></div> Healthy</span>
            <span style={{ color: '#e2e8f0' }}>|</span>
            <span style={S.notifLink}>Notifications limit</span>
          </div>
        </div>
        <div style={S.btnGroup}>
          <button style={S.btnGhostHeader}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            Create RCS Campaign
          </button>
          <button style={S.btnDarkGreen} onClick={() => setShowCreateModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            Create Whatsapp Campaign
          </button>
        </div>
      </div>

      {/* Toolbar / Search / Filters Block */}
      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input style={S.searchInput} placeholder="Search by name" />
        </div>
        
        <div style={S.filterGroup}>
          <div style={S.filterItem}>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></span>
            : <span style={S.filterVal}>WhatsApp ⌄</span>
          </div>
          <div style={S.filterItem}>
            <span>⚑</span> Status ⌄
          </div>
          <div style={S.filterItem}>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></span> Category ⌄
          </div>
          <div style={S.filterItem}>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></span> Created by ⌄
          </div>
          <div style={S.filterItem}>
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></span> Date Set Live ⌄
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabsContainer}>
        {['One Time Campaigns', 'Ongoing Campaigns', 'API campaigns'].map(t => (
          <div key={t} style={{ ...S.tabItem, ...(activeTab === t ? S.tabActive : {}) }} onClick={() => setActiveTab(t)}>
            {t}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={S.tableContainer}>
        <table style={S.table}>
          <thead>
            <tr>
              {['Campaign Name', 'Channel', 'Created By', 'Category', 'Status', 'Attempted', 'Sent', 'Delivered', 'Read', 'Replied', 'Set Live'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No campaigns found.</td></tr>
            )}
            {campaigns.map((c, i) => (
              <tr key={i} style={{ cursor: 'pointer' }} onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <td style={{ ...S.td, fontWeight: 500 }}>{c.name}</td>
                <td style={S.td}>Whatsapp</td>
                <td style={S.td}>krushna j</td>
                <td style={S.td}>Marketing</td>
                <td style={S.td}>
                  {c.status.toLowerCase() === 'completed' || c.status.toLowerCase() === 'sent' ? (
                    <span style={S.badgeCompleted}>Completed</span>
                  ) : c.status}
                </td>
                <td style={{ ...S.td }}>{c.contacts.toLocaleString()}</td>
                <td style={{ ...S.td }}>{c.sent.toLocaleString()}</td>
                <td style={{ ...S.td, fontWeight: 500 }}>{getPerc(c.delivered, c.sent)}</td>
                <td style={{ ...S.td, fontWeight: 500 }}>{getPerc(c.read, c.sent)}</td>
                <td style={{ ...S.td }}>--</td>
                <td style={{ ...S.td, color: '#64748b' }}>{c.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer / Pagination */}
      <div style={S.footer}>
        <div style={S.paginationInfo}>
          {campaigns.length} out of {campaigns.length} Campaigns
        </div>
        <div style={S.paginationNav}>
          <button style={S.pageBtn}>&lt;</button>
          <button style={{ ...S.pageBtn, ...S.pageBtnActive }}>1</button>
          <button style={S.pageBtn}>2</button>
          <button style={S.pageBtn}>3</button>
          <button style={S.pageBtn}>&gt;</button>
        </div>
      </div>

      {/* Floating Help Button */}
      <button style={S.helpBtn}>
        <div style={{ border: '2px solid white', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>?</div>
        Help
      </button>

      {/* Modal Overlay */}
      {showCreateModal && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox}>
            {/* Modal Header */}
            <div style={S.modalHeader}>
              <div style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                Create New Campaign
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button style={{ ...S.btnDarkGreen, padding: '6px 14px', fontSize: '13px' }}>+ Create from scratch</button>
                <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={S.modalBody}>
              {/* Left Column */}
              <div style={S.modalLeft}>
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                  {['Sample Ideas', 'Active Templates'].map(t => (
                    <div key={t} onClick={() => { setActiveModalTab(t); setSelectedSampleIdx(0); setSelectedApprovedId(''); }} style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontSize: '13px', fontWeight: activeModalTab === t ? 600 : 500, color: activeModalTab === t ? '#115e59' : '#64748b', borderBottom: activeModalTab === t ? '2px solid #115e59' : '2px solid transparent', cursor: 'pointer', backgroundColor: activeModalTab === t ? '#f0fdf4' : '#fff' }}>
                      {t}
                    </div>
                  ))}
                </div>
                <div style={{ padding: '12px', display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ ...S.searchBox, flex: 1, width: 'auto', backgroundColor: '#fff', padding: '6px 10px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input style={{ ...S.searchInput, fontSize: '12px' }} placeholder="Search by Theme" />
                  </div>
                  <button style={{ ...S.btnGhostHeader, padding: '4px 10px', fontSize: '12px', color: '#115e59' }}>Refresh List</button>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {activeModalTab === 'Sample Ideas' && SAMPLE_TEMPLATES.map((mock, i) => {
                    const catColor = mock.cat === 'Marketing' ? '#ea580c' : mock.cat === 'Authentication' ? '#7c3aed' : '#0891b2';
                    return (
                      <div key={i} onClick={() => setSelectedSampleIdx(i)} style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: selectedSampleIdx === i ? '#f0fdf4' : '#fff', position: 'relative' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{mock.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>(English)</div>
                        <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '11px', color: catColor, backgroundColor: catColor + '1a', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>{mock.cat}</div>
                      </div>
                    );
                  })}
                  {activeModalTab === 'Active Templates' && approvedTemplates.length === 0 && (
                    <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', lineHeight: '1.6' }}>
                      No approved templates yet.<br />Go to <strong>Templates</strong> to create and submit one for approval.
                    </div>
                  )}
                  {activeModalTab === 'Active Templates' && approvedTemplates.map((t) => (
                    <div key={t.id} onClick={() => setSelectedApprovedId(t.id)} style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: selectedApprovedId === t.id ? '#f0fdf4' : '#fff', position: 'relative' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px', fontFamily: 'monospace' }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>(English)</div>
                      <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '11px', backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>Approved</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column */}
              <div style={S.modalRight}>
                <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ color: '#2563eb', fontSize: '12px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, marginBottom: '8px' }}>
                      Who will receive this message <span style={{ cursor: 'pointer' }}>^</span>
                    </div>
                    <div style={{ lineHeight: '1.5' }}>
                      All opted-in customers are selected as the default audience. When the customer clicks on the 'View Products' button, the catalog browsing flow will start. If the customer clicks on "Stop", their WhatsApp Opted status will...
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                    <div style={{ border: '1px solid #e2e8f0', padding: '4px', borderRadius: '4px', color: '#3b82f6' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
                    <div style={{ border: '1px solid #e2e8f0', padding: '4px', borderRadius: '4px', color: '#94a3b8' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg></div>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBottom: '90px' }}>
                  {(() => {
                    const previewText = activeModalTab === 'Sample Ideas'
                      ? SAMPLE_TEMPLATES[selectedSampleIdx]?.preview ?? ''
                      : selectedApprovedId
                        ? (approvedTemplates.find(t => t.id === selectedApprovedId)?.name ?? '') + '\n\n(Select a template to preview its content)'
                        : 'Select an approved template\nfrom the list to preview it here.';
                    return (
                      <div style={{ width: '280px', height: '360px', backgroundColor: '#fff', borderRadius: '24px', border: '10px solid #111827', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ backgroundColor: '#075e54', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                          <span>←</span>
                          <div style={{ width: '24px', height: '24px', backgroundColor: '#cbd5e1', borderRadius: '50%' }} />
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>
                            {activeModalTab === 'Sample Ideas'
                              ? SAMPLE_TEMPLATES[selectedSampleIdx]?.name
                              : approvedTemplates.find(t => t.id === selectedApprovedId)?.name ?? 'Your Business'}
                          </span>
                        </div>
                        <div style={{ flex: 1, backgroundColor: '#efeae2', padding: '16px', overflowY: 'auto' }}>
                          <div style={{ textAlign: 'center', fontSize: '10px', color: '#64748b', marginBottom: '12px', backgroundColor: '#e2e8f0', borderRadius: '10px', padding: '2px 8px', display: 'inline-block' }}>Today</div>
                          <div style={{ backgroundColor: '#fff', borderRadius: '8px', borderTopLeftRadius: '0px', padding: '8px 12px', fontSize: '12px', color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', whiteSpace: 'pre-line' }}>
                            {previewText}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(to top, rgba(255,255,255,1) 50%, rgba(255,255,255,0))', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', padding: '20px 24px' }}>
                  <button
                    disabled={activeModalTab === 'Active Templates' && !selectedApprovedId}
                    onClick={() => {
                      if (activeModalTab === 'Active Templates' && selectedApprovedId) {
                        setSelectedTemplateId(selectedApprovedId);
                      }
                      setShowCreateModal(false);
                      navigate('/wh/create-campaign');
                    }}
                    style={{ ...S.btnDarkGreen, padding: '10px 24px', fontSize: '14px', opacity: activeModalTab === 'Active Templates' && !selectedApprovedId ? 0.5 : 1, cursor: activeModalTab === 'Active Templates' && !selectedApprovedId ? 'not-allowed' : 'pointer' }}
                  >
                    {activeModalTab === 'Sample Ideas' ? 'Use this Sample' : 'Use this Template'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
