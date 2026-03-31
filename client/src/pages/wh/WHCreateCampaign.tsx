import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Sample template definitions ───────────────────────────────────────────────
const SAMPLE_TEMPLATES = [
  { name: 'Welcome Message',       cat: 'Utility',        preview: 'Hi {{1}} 👋\n\nWelcome to our service! We\'re glad to have you on board.\n\nReply HELP at any time for support.' },
  { name: 'Order Confirmation',    cat: 'Utility',        preview: 'Hi {{1}},\n\nYour order #{{2}} is confirmed ✅\n\nEstimated delivery: {{3}}\nTrack here: {{4}}' },
  { name: 'Flash Sale Alert',      cat: 'Marketing',      preview: '🎉 Flash Sale!\n\nHi {{1}}, get {{2}}% OFF today only!\n\nShop now: {{3}}\n\nReply STOP to opt out.' },
  { name: 'Appointment Reminder',  cat: 'Utility',        preview: 'Hi {{1}},\n\nReminder: your appointment is on {{2}} at {{3}}.\n\nReply CONFIRM to confirm.' },
  { name: 'Product Launch',        cat: 'Marketing',      preview: '🚀 Just Launched!\n\nHi {{1}}, we\'re excited to introduce {{2}}.\n\nBe the first to explore: {{3}}' },
  { name: 'Feedback Request',      cat: 'Marketing',      preview: 'Hi {{1}},\n\nThank you for choosing us! How was your experience? ⭐\n\nShare feedback: {{2}}' },
  { name: 'Shipping Update',       cat: 'Utility',        preview: 'Hi {{1}},\n\nYour order #{{2}} is out for delivery 🚚\n\nETA: {{3}}\nTrack live: {{4}}' },
  { name: 'Payment Reminder',      cat: 'Utility',        preview: 'Hi {{1}},\n\nYour payment of ₹{{2}} is due on {{3}}.\n\nPay now to avoid late charges: {{4}}' },
  { name: 'Restock Alert',         cat: 'Marketing',      preview: '🔔 Back in Stock!\n\nHi {{1}}, {{2}} is available again.\n\nGrab yours before it sells out: {{3}}' },
  { name: 'Account OTP',           cat: 'Authentication', preview: 'Hi {{1}},\n\nYour OTP is {{2}}. It expires in 10 minutes.\n\nDo not share this code with anyone.' },
];

type ApprovedTemplate = { id: string; name: string; body: string };

const catColor = (cat: string) =>
  cat === 'Marketing' ? '#ea580c' : cat === 'Authentication' ? '#7c3aed' : '#0891b2';

const S = {
  page: { backgroundColor: '#f1f5f9', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', display: 'flex', flexDirection: 'column' as const, color: '#1e293b' },
  topBar: { backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', position: 'sticky' as const, top: 0, zIndex: 10 },
  leftGroup: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: { background: 'none', border: 'none', color: '#64748b', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  titleInput: { border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 12px', fontSize: '15px', color: '#1e293b', width: '280px', outline: 'none' },
  rightGroup: { display: 'flex', alignItems: 'center', gap: '12px' },
  btnBalance: { backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'default' },
  btnDraft: { backgroundColor: '#fff', border: '1px solid #115e59', color: '#115e59', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnLive: { backgroundColor: '#115e59', border: 'none', color: '#fff', borderRadius: '4px', padding: '8px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnLiveDisabled: { backgroundColor: '#cbd5e1', border: 'none', color: '#fff', borderRadius: '4px', padding: '8px 24px', fontSize: '13px', fontWeight: 600, cursor: 'not-allowed' },
  bodyArea: { padding: '24px', display: 'flex', gap: '24px', maxWidth: '1440px', margin: '0 auto', width: '100%', boxSizing: 'border-box' as const },
  leftCol: { flex: '1 1 60%', minWidth: '0', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  rightCol: { width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: '16px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '16px' },
  sectionTitle: { fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px' },
  stepCard: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column' as const },
  stepHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer' },
  stepHeaderLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  circleActive: { backgroundColor: '#115e59', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 },
  circlePending: { backgroundColor: '#e2e8f0', color: '#64748b', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 },
  circleDone: { backgroundColor: '#dcfce7', color: '#15803d', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 },
  stepTitle: { fontSize: '14px', fontWeight: 600, color: '#1e293b' },
  stepHeaderRight: { display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b', fontSize: '13px' },
  stepBody: { padding: '0 20px 20px 20px', borderTop: '1px solid #f1f5f9' },
  label: { fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '12px', display: 'block', marginTop: '16px' },
  typeCardsRow: { display: 'flex', gap: '16px' },
  typeCardActive: { flex: 1, backgroundColor: '#f0fdf4', border: '1px solid #10b981', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'flex-start', cursor: 'pointer', position: 'relative' as const },
  typeCardInactive: { flex: 1, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'flex-start', cursor: 'pointer', position: 'relative' as const },
  iconBoxGreen: { backgroundColor: '#115e59', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px', flexShrink: 0 },
  iconBoxGrey: { backgroundColor: '#e2e8f0', color: '#64748b', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px', flexShrink: 0 },
  radioOuter: { position: 'absolute' as const, top: '16px', right: '16px', width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #115e59', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  radioOuterInactive: { position: 'absolute' as const, top: '16px', right: '16px', width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #cbd5e1' },
  radioInner: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#115e59' },
  saveBtnBlock: { display: 'flex', justifyContent: 'flex-end', marginTop: '20px' },
  btnSave: { backgroundColor: '#115e59', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnGhost: { backgroundColor: 'transparent', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' },
  input: { width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px', fontSize: '14px', color: '#1e293b', outline: 'none', boxSizing: 'border-box' as const, backgroundColor: '#f8fafc' },
  rightTopActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  btnTestMsg: { backgroundColor: '#115e59', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  osIcons: { display: 'flex', gap: '8px' },
  osBtn: { border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px', color: '#3b82f6', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  osBtnDisabled: { border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px', color: '#94a3b8', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  phoneOuter: { width: '100%', maxWidth: '300px', aspectRatio: '9/16', backgroundColor: '#111827', borderRadius: '32px', border: '8px solid #1e293b', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', margin: '0 auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  waHeader: { backgroundColor: '#075e54', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' },
  waProfile: { display: 'flex', alignItems: 'center', gap: '8px' },
  waAvatar: { width: '28px', height: '28px', backgroundColor: '#94a3b8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  waTitle: { fontSize: '14px', fontWeight: 600 },
  waBody: { flex: 1, backgroundColor: '#efeae2', padding: '16px', overflowY: 'auto' as const },
  waBubble: { backgroundColor: '#fff', borderRadius: '8px', borderTopLeftRadius: '0px', padding: '10px 12px', fontSize: '12px', color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', maxWidth: '90%', lineHeight: '1.5' },
  helpBubble: { position: 'fixed' as const, bottom: '24px', right: '24px', display: 'flex', gap: '12px', alignItems: 'flex-end', zIndex: 50 },
  helpBtn: { backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '20px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '6px' },
};

export default function WHCreateCampaign() {
  const navigate = useNavigate();

  // ── Accordion state ────────────────────────────────────────────────────────
  const [openStep, setOpenStep] = useState<1 | 2 | 3>(1);
  const [campaignType, setCampaignType] = useState<'onetime' | 'ongoing'>('onetime');
  const [step1Done, setStep1Done] = useState(false);

  // ── Template state ─────────────────────────────────────────────────────────
  const [approvedTemplates, setApprovedTemplates] = useState<ApprovedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [showPicker, setShowPicker] = useState(true);
  const [pickerTab, setPickerTab] = useState<'Approved Templates' | 'Sample Ideas'>('Approved Templates');

  // ── Fetch approved templates ───────────────────────────────────────────────
  useEffect(() => {
    const workspaceId = localStorage.getItem('workspaceId') ?? '';
    const token = localStorage.getItem('token') ?? '';
    fetch(`/api/v1/workspaces/${workspaceId}/templates?status=APPROVED`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: any[]) =>
        setApprovedTemplates(data.map(t => ({ id: t.id, name: t.name, body: t.bodyText ?? '' })))
      )
      .catch(() => {});
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isSample = selectedTemplateId.startsWith('sample_');
  const sampleIdx = isSample ? parseInt(selectedTemplateId.replace('sample_', ''), 10) : -1;
  const selectedSample = sampleIdx >= 0 ? SAMPLE_TEMPLATES[sampleIdx] : null;
  const selectedApproved = !isSample ? approvedTemplates.find(t => t.id === selectedTemplateId) : null;
  const step2Done = !!selectedApproved;

  const selectTemplate = (id: string, body: string) => {
    setSelectedTemplateId(id);
    setTemplateBody(body);
    setShowPicker(false);
  };

  const displayName = selectedSample?.name ?? selectedApproved?.name ?? '';

  return (
    <div style={S.page}>

      {/* ── Top Bar ── */}
      <div style={S.topBar}>
        <div style={S.leftGroup}>
          <button style={S.backBtn} onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <input style={S.titleInput} placeholder="Enter Campaign Name" />
        </div>
        <div style={S.rightGroup}>
          <div style={S.btnBalance}>Balance Needed: --</div>
          <button style={S.btnDraft}>Save as Draft</button>
          <button style={step2Done ? S.btnLive : S.btnLiveDisabled} disabled={!step2Done}>Go Live</button>
        </div>
      </div>

      <div style={S.bodyArea}>

        {/* ── Left Column ── */}
        <div style={S.leftCol}>
          <div style={S.sectionTitle}>Basic Settings (Mandatory)</div>

          {/* ── STEP 1: Campaign Type ── */}
          <div style={S.stepCard}>
            <div style={S.stepHeader} onClick={() => setOpenStep(1)}>
              <div style={S.stepHeaderLeft}>
                <div style={step1Done ? S.circleDone : S.circleActive}>
                  {step1Done ? '✓' : '1'}
                </div>
                <div style={S.stepTitle}>Choose your campaign type</div>
              </div>
              <div style={S.stepHeaderRight}>
                {step1Done && <span style={{ fontSize: '12px', color: '#15803d' }}>{campaignType === 'onetime' ? 'One Time' : 'Ongoing'}</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {openStep === 1 ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
                </svg>
              </div>
            </div>

            {openStep === 1 && (
              <div style={S.stepBody}>
                <span style={S.label}>Campaign Type</span>
                <div style={S.typeCardsRow}>
                  <div style={campaignType === 'onetime' ? S.typeCardActive : S.typeCardInactive} onClick={() => setCampaignType('onetime')}>
                    <div style={campaignType === 'onetime' ? S.iconBoxGreen : S.iconBoxGrey}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>One Time Campaign</div>
                      <div style={{ fontSize: '12px', color: campaignType === 'onetime' ? '#0f766e' : '#64748b', lineHeight: '1.4' }}>Send a one-time broadcast to many customers at once.</div>
                    </div>
                    {campaignType === 'onetime'
                      ? <div style={S.radioOuter}><div style={S.radioInner}/></div>
                      : <div style={S.radioOuterInactive}/>
                    }
                  </div>

                  <div style={campaignType === 'ongoing' ? S.typeCardActive : S.typeCardInactive} onClick={() => setCampaignType('ongoing')}>
                    <div style={campaignType === 'ongoing' ? S.iconBoxGreen : S.iconBoxGrey}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Ongoing Campaign</div>
                      <div style={{ fontSize: '12px', color: campaignType === 'ongoing' ? '#0f766e' : '#64748b', lineHeight: '1.4' }}>Triggered automatically on pre-defined events.</div>
                    </div>
                    {campaignType === 'ongoing'
                      ? <div style={S.radioOuter}><div style={S.radioInner}/></div>
                      : <div style={S.radioOuterInactive}/>
                    }
                  </div>
                </div>

                <div style={S.saveBtnBlock}>
                  <button style={S.btnSave} onClick={() => { setStep1Done(true); setOpenStep(2); }}>Save & Next</button>
                </div>
              </div>
            )}
          </div>

          {/* ── STEP 2: Choose Message Template ── */}
          <div style={S.stepCard}>
            <div style={S.stepHeader} onClick={() => setOpenStep(2)}>
              <div style={S.stepHeaderLeft}>
                <div style={step2Done ? S.circleDone : openStep === 2 ? S.circleActive : S.circlePending}>
                  {step2Done ? '✓' : '2'}
                </div>
                <div style={S.stepTitle}>Choose your message template</div>
              </div>
              <div style={S.stepHeaderRight}>
                {displayName && <span style={{ fontSize: '12px', color: step2Done ? '#15803d' : '#ea580c', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{displayName}</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {openStep === 2 ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
                </svg>
              </div>
            </div>

            {openStep === 2 && (
              <div style={S.stepBody}>

                {/* ── PICKER VIEW ── */}
                {showPicker && (
                  <div>
                    {/* Tab bar */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginTop: '12px', marginBottom: '12px' }}>
                      {(['Approved Templates', 'Sample Ideas'] as const).map(tab => (
                        <button key={tab} onClick={() => setPickerTab(tab)} style={{ background: 'none', border: 'none', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: pickerTab === tab ? '#115e59' : '#64748b', borderBottom: pickerTab === tab ? '2px solid #115e59' : '2px solid transparent' }}>
                          {tab}
                        </button>
                      ))}
                    </div>

                    {/* Approved list */}
                    {pickerTab === 'Approved Templates' && (
                      <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        {approvedTemplates.length === 0 ? (
                          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', lineHeight: '1.7' }}>
                            No approved templates found.<br/>
                            Go to the <strong>Templates</strong> page to create and submit one for approval.
                          </div>
                        ) : approvedTemplates.map(t => (
                          <div key={t.id} onClick={() => selectTemplate(t.id, t.body)} style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: selectedTemplateId === t.id ? '#f0fdf4' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: '#1e293b' }}>{t.name}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Approved · English</div>
                            </div>
                            <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: '12px', fontWeight: 600, flexShrink: 0 }}>Approved</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sample list */}
                    {pickerTab === 'Sample Ideas' && (
                      <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        {SAMPLE_TEMPLATES.map((tpl, i) => {
                          const cc = catColor(tpl.cat);
                          const key = `sample_${i}`;
                          return (
                            <div key={i} onClick={() => selectTemplate(key, tpl.preview)} style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: selectedTemplateId === key ? '#f0fdf4' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{tpl.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Sample · English</div>
                              </div>
                              <span style={{ fontSize: '11px', color: cc, backgroundColor: cc + '1a', padding: '2px 10px', borderRadius: '12px', fontWeight: 600, flexShrink: 0 }}>{tpl.cat}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Back button when re-picking */}
                    {selectedTemplateId && (
                      <div style={{ marginTop: '12px' }}>
                        <button style={S.btnGhost} onClick={() => setShowPicker(false)}>← Back to template</button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── EDITOR VIEW ── */}
                {!showPicker && selectedTemplateId && (
                  <div style={{ marginTop: '12px' }}>

                    {/* Template name + badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', fontFamily: isSample ? 'inherit' : 'monospace' }}>
                        {displayName}
                      </span>
                      {isSample
                        ? <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#b45309', padding: '2px 10px', borderRadius: '12px', fontWeight: 600 }}>Sample — reference only</span>
                        : <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: '12px', fontWeight: 600 }}>✓ Approved</span>
                      }
                    </div>

                    {/* Warning for samples */}
                    {isSample && (
                      <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#92400e', marginBottom: '14px', lineHeight: '1.6' }}>
                        ⚠️ Sample templates are for reference only. To go live, please select an <strong>Approved Template</strong>.
                      </div>
                    )}

                    {/* Editable textarea */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={S.label}>
                        Template Body
                        <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '6px', fontSize: '12px' }}>(editable)</span>
                      </label>
                      <textarea
                        style={{ ...S.input, resize: 'vertical' as const, minHeight: '160px', fontFamily: 'inherit', lineHeight: '1.6' }}
                        value={templateBody}
                        onChange={e => setTemplateBody(e.target.value)}
                        placeholder="Template content will appear here…"
                      />
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        {'{{1}}'}, {'{{2}}'} etc. are replaced with actual values at send time.
                      </div>
                    </div>

                    {/* Choose another */}
                    <button
                      style={{ ...S.btnGhost, display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => { setShowPicker(true); setPickerTab('Approved Templates'); }}
                    >
                      ↩ Choose Another Template
                    </button>

                    {/* Save step */}
                    {!isSample && (
                      <div style={S.saveBtnBlock}>
                        <button style={S.btnSave} onClick={() => setOpenStep(3)}>Save & Next</button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* ── STEP 3: Audience ── */}
          <div style={S.stepCard}>
            <div style={S.stepHeader} onClick={() => setOpenStep(3)}>
              <div style={S.stepHeaderLeft}>
                <div style={openStep === 3 ? S.circleActive : S.circlePending}>3</div>
                <div style={S.stepTitle}>Choose your audience</div>
              </div>
              <div style={S.stepHeaderRight}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {openStep === 3 ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
                </svg>
              </div>
            </div>
            {openStep === 3 && (
              <div style={S.stepBody}>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '16px' }}>
                  Audience selection coming soon.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Phone Preview ── */}
        <div style={S.rightCol}>
          <div style={S.rightTopActions}>
            <button style={S.btnTestMsg}>Send Test Message</button>
            <div style={S.osIcons}>
              <div style={S.osBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997zm-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997zm11.4045-6.02l1.9973-3.4592a.4158.4158 0 0 0-.1507-.5665.415.415 0 0 0-.5651.1504l-2.0402 3.5358A11.751 11.751 0 0 0 12 7.6253c-1.802 0-3.5135.4093-5.0628 1.139l-2.0402-3.5358a.4173.4173 0 0 0-.5651-.1504.4172.4172 0 0 0-.1507.5665l1.9973 3.4594C2.6974 11.0261 0 15.0184 0 19.6253h24c0-4.6069-2.6974-8.5992-6.1185-10.3039z"/></svg>
              </div>
              <div style={S.osBtnDisabled}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              </div>
            </div>
          </div>

          <div style={S.phoneOuter}>
            <div style={S.waHeader}>
              <div style={S.waProfile}>
                <span style={{ fontSize: '16px' }}>←</span>
                <div style={S.waAvatar}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
                </div>
                <div style={S.waTitle}>{displayName || 'Your Business'}</div>
              </div>
              <div style={{ display: 'flex', gap: '14px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </div>
            </div>

            <div style={S.waBody}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', backgroundColor: '#e2e8f0', borderRadius: '10px', padding: '2px 10px' }}>Today</span>
              </div>

              {templateBody ? (
                <div style={S.waBubble}>
                  <div style={{ whiteSpace: 'pre-line' }}>{templateBody}</div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', marginTop: '40px', padding: '0 16px', lineHeight: '1.6' }}>
                  Select a template to preview the message here
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── Floating Help ── */}
      <div style={S.helpBubble}>
        <button style={S.helpBtn}>
          <div style={{ border: '2px solid white', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>?</div>
          Help
        </button>
      </div>

    </div>
  );
}
