import { useState } from 'react';

// ---------- types ----------
type ModalType = 'twilio' | 'exotel' | 'sip' | 'buy' | null;

interface TwilioForm {
  name: string;
  phoneNumber: string;
  accountSid: string;
  accountToken: string;
}

interface ExotelForm {
  name: string;
  phoneNumber: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  accountSid: string;
  appId: string;
}

interface SipForm {
  name: string;
  provider: string;
  phoneNumber: string;
  sipHost: string;
  sipPort: string;
  username: string;
  password: string;
}

// ---------- shared styled input ----------
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '7px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '13px',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={(e) => (e.target.style.borderColor = 'rgba(0,212,200,0.5)')}
        onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
      />
    </div>
  );
}

// ---------- phone number field with flag ----------
function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '7px' }}>
        Phone Number
      </label>
      <div style={{ display: 'flex', alignItems: 'center', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '10px 12px',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontSize: '13px',
          color: '#fff',
        }}>
          🇺🇸 <span style={{ color: '#aaa' }}>+1</span>
        </div>
        <input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Phone number"
          style={{
            flex: 1,
            padding: '10px 12px',
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

// ---------- Standard (narrow) modal ----------
function NarrowModal({
  title,
  icon,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '32px',
          width: '520px',
          maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          animation: 'modalIn 0.18s ease',
        }}
      >
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(0,212,200,0.12)', border: '1px solid rgba(0,212,200,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              {icon}
            </div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>{title}</h2>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px', marginTop: '4px' }}>
          Import an existing phone number from your {title.replace('Import ', '').replace(' Number', '')} account
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{children}</div>
        <ModalFooter onClose={onClose} onSubmit={onSubmit} />
      </div>
    </div>
  );
}

// ---------- Wide (two-column) Exotel modal ----------
function ExotelModal({
  onClose,
  onSubmit,
  form,
  setForm,
}: {
  onClose: () => void;
  onSubmit: () => void;
  form: ExotelForm;
  setForm: React.Dispatch<React.SetStateAction<ExotelForm>>;
}) {
  const set = (key: keyof ExotelForm) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '24px 0',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0a0f1a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          width: '900px',
          maxWidth: '97vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
          animation: 'modalIn 0.18s ease',
          overflow: 'hidden',
        }}
      >
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>

        {/* ── Header ── */}
        <div style={{ padding: '28px 32px 0 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <span style={{ fontSize: '22px' }}>📞</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fff' }}>Import Exotel Number</h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              Import an existing phone number from your Exotel account
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* ── Body (two columns) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', padding: '24px 32px 0 32px' }}>

          {/* Left — Setup Guide */}
          <div style={{ paddingRight: '32px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '16px', marginTop: 0 }}>Setup Guide</h3>

            {/* Video embed */}
            <div style={{
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
              marginBottom: '20px',
              background: '#000',
            }}>
              <video
                controls
                style={{ width: '100%', display: 'block', maxHeight: '230px', objectFit: 'cover' }}
                poster=""
              >
                {/* Replace src with real tutorial video URL */}
                <source src="" type="video/mp4" />
                <p style={{ color: '#aaa', textAlign: 'center', padding: '40px 16px', margin: 0, fontSize: '13px' }}>
                  Tutorial video unavailable
                </p>
              </video>
            </div>

            {/* Doc link note */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '8px',
              padding: '14px',
            }}>
              <span style={{ fontSize: '16px', marginTop: '1px', flexShrink: 0 }}>ℹ️</span>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.6 }}>
                Please read our{' '}
                <a
                  href="https://support.exotel.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#00d4c8', textDecoration: 'none', borderBottom: '1px solid rgba(0,212,200,0.4)' }}
                >
                  Exotel Import Doc ↗
                </a>{' '}
                to understand how to import an Exotel phone number and gather the required credentials.
              </p>
            </div>
          </div>

          {/* Right — Form fields */}
          <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="Name" value={form.name} onChange={set('name')} placeholder="Enter a name for this number" />
            <PhoneField value={form.phoneNumber} onChange={set('phoneNumber')} />
            <Field label="API Key" value={form.apiKey} onChange={set('apiKey')} placeholder="Enter your Exotel API Key" />
            <Field label="API Token" value={form.apiToken} onChange={set('apiToken')} placeholder="Enter your Exotel API Token" type="password" />
            <Field label="Subdomain" value={form.subdomain} onChange={set('subdomain')} placeholder="Enter your Exotel Subdomain" />
            <Field label="Account SID" value={form.accountSid} onChange={set('accountSid')} placeholder="Enter your Exotel Account SID" />
            <Field label="App ID" value={form.appId} onChange={set('appId')} placeholder="Enter your Exotel App ID" />
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '20px 32px 28px 32px' }}>
          <ModalFooter onClose={onClose} onSubmit={onSubmit} />
        </div>
      </div>
    </div>
  );
}

// ---------- shared close button ----------
function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#aaa',
        width: '32px', height: '32px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '15px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
      onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
    >
      ✕
    </button>
  );
}

// ---------- shared footer buttons ----------
function ModalFooter({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
      <button
        onClick={onClose}
        style={{
          padding: '10px 22px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#ccc',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          transition: 'border-color 0.15s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        style={{
          padding: '10px 22px',
          background: 'linear-gradient(135deg, #00d4c8, #00bcd4)',
          color: '#000',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 700,
          boxShadow: '0 4px 16px rgba(0,212,200,0.3)',
          transition: 'opacity 0.15s, transform 0.1s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        Import Number
      </button>
    </div>
  );
}

// ---------- SIP Provider list ----------
const SIP_PROVIDERS = [
  'Twilio', 'Vonage', 'Bandwidth', 'Telnyx', 'Plivo', 'SignalWire',
  'Lingo Telecom', 'Flowroute', 'VoIP.ms', 'Other/Unknown',
];

// ---------- SIP Trunk Modal ----------
function SipTrunkModal({
  onClose, onSubmit, form, setForm,
}: {
  onClose: () => void;
  onSubmit: () => void;
  form: SipForm;
  setForm: React.Dispatch<React.SetStateAction<SipForm>>;
}) {
  const set = (key: keyof SipForm) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const [providerOpen, setProviderOpen] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: '7px',
  };

  const hintStyle: React.CSSProperties = {
    fontSize: '11.5px',
    color: '#64748b',
    marginTop: '5px',
    lineHeight: 1.5,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '24px 0',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0a0f1a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '32px',
          width: '560px',
          maxWidth: '96vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
          animation: 'modalIn 0.18s ease',
        }}
      >
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px' }}>📞</span>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#fff' }}>Import SIP Trunk Number</h2>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px', lineHeight: 1.5 }}>
          Import a phone number from your SIP provider (Twilio, Vonage, etc.) by entering your SIP credentials
        </p>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="Enter a name for this number"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,212,200,0.6)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
            <p style={hintStyle}>Display name for this phone number</p>
          </div>

          {/* SIP Provider dropdown */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>SIP Provider/Carrier</label>
            <div
              onClick={() => setProviderOpen(!providerOpen)}
              style={{
                ...inputStyle,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', userSelect: 'none',
                color: form.provider ? '#fff' : '#4b5563',
              }}
            >
              <span>{form.provider || 'Select your SIP provider'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"
                style={{ transform: providerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {providerOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', zIndex: 20, overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {SIP_PROVIDERS.map((p) => (
                  <div
                    key={p}
                    onClick={() => { set('provider')(p); setProviderOpen(false); }}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                      color: form.provider === p ? '#00d4c8' : '#e2e8f0',
                      background: form.provider === p ? 'rgba(0,212,200,0.08)' : 'transparent',
                      transition: 'background 0.12s',
                    }}
                    onMouseOver={(e) => { if (form.provider !== p) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseOut={(e) => { if (form.provider !== p) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {p}
                  </div>
                ))}
              </div>
            )}
            <p style={hintStyle}>Select your SIP provider. If your provider isn't listed, choose "Other/Unknown".</p>
          </div>

          {/* Phone Number with flag */}
          <div>
            <label style={labelStyle}>Phone Number</label>
            <div style={{ display: 'flex', alignItems: 'center', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', fontSize: '13px', color: '#fff' }}>
                🇺🇸 <span style={{ color: '#aaa' }}>+1</span>
              </div>
              <input
                type="tel"
                value={form.phoneNumber}
                onChange={(e) => set('phoneNumber')(e.target.value)}
                placeholder="Phone number"
                style={{ flex: 1, padding: '10px 12px', background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none' }}
              />
            </div>
          </div>

          {/* SIP Host */}
          <div>
            <label style={labelStyle}>SIP Host</label>
            <input
              value={form.sipHost}
              onChange={(e) => set('sipHost')(e.target.value)}
              placeholder="e.g., sip.yourprovider.com"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,212,200,0.6)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>

          {/* SIP Port */}
          <div>
            <label style={labelStyle}>SIP Port</label>
            <input
              value={form.sipPort}
              onChange={(e) => set('sipPort')(e.target.value)}
              placeholder="5060"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,212,200,0.6)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>

          {/* SIP Username (Optional) */}
          <div>
            <label style={labelStyle}>SIP Username <span style={{ fontWeight: 400, color: '#64748b' }}>(Optional)</span></label>
            <input
              value={form.username}
              onChange={(e) => set('username')(e.target.value)}
              placeholder="Your SIP provider username"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,212,200,0.6)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>

          {/* SIP Password (Optional) */}
          <div>
            <label style={labelStyle}>SIP Password <span style={{ fontWeight: 400, color: '#64748b' }}>(Optional)</span></label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password')(e.target.value)}
              placeholder="Your SIP provider password"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,212,200,0.6)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
            <p style={hintStyle}>Leave empty if using IP whitelisting/ACL instead of username/password authentication</p>
          </div>

          {/* Get Help banner */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '16px', marginTop: '1px', flexShrink: 0 }}>ℹ️</span>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', fontWeight: 500, lineHeight: 1.5 }}>
                Having trouble with SIP setup? Our team can help you configure your provider.
              </p>
            </div>
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '8px 16px',
                background: 'rgba(0,212,200,0.1)',
                border: '1px solid rgba(0,212,200,0.3)',
                color: '#00d4c8',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transition: 'background 0.15s',
                flexShrink: 0,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(0,212,200,0.18)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(0,212,200,0.1)')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Get Help
            </button>
          </div>

        </div>

        <ModalFooter onClose={onClose} onSubmit={onSubmit} />
      </div>
    </div>
  );
}

// ---------- Numbers Shop Modal data ----------
const COUNTRIES = [
  { code: 'IN', flag: '🇮🇳', name: 'India', prefix: '+91' },
  { code: 'US', flag: '🇺🇸', name: 'United States', prefix: '+1' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom', prefix: '+44' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia', prefix: '+61' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada', prefix: '+1' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore', prefix: '+65' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE', prefix: '+971' },
];

const MOCK_NUMBERS: Record<string, string[]> = {
  IN: ['+918048799924','+918048799278','+918048799921','+918048799904','+918048799273','+918048795274','+918046333208','+918048799280'],
  US: ['+12025550101','+13105550182','+14155550193','+16465550144','+17025550155','+18185550166','+19175550177','+12125550188'],
  GB: ['+447700900001','+447700900002','+447700900003','+447700900004','+447700900005','+447700900006','+447700900007','+447700900008'],
  AU: ['+61261000001','+61261000002','+61261000003','+61261000004','+61261000005','+61261000006','+61261000007','+61261000008'],
  CA: ['+14165550101','+14165550102','+14165550103','+14165550104','+14165550105','+14165550106','+14165550107','+14165550108'],
  SG: ['+6561000001','+6561000002','+6561000003','+6561000004','+6561000005','+6561000006','+6561000007','+6561000008'],
  AE: ['+97141000001','+97141000002','+97141000003','+97141000004','+97141000005','+97141000006','+97141000007','+97141000008'],
};

function NumbersShopModal({ onClose }: { onClose: () => void }) {
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [pattern, setPattern] = useState('');
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [seed, setSeed] = useState(0);
  const [confirmNum, setConfirmNum] = useState<string | null>(null);
  const [kycNum, setKycNum] = useState<string | null>(null);

  const numbers = MOCK_NUMBERS[selectedCountry.code] || [];
  const filtered = pattern.trim()
    ? numbers.filter(n => n.includes(pattern.replace(/[^0-9]/g, '')))
    : numbers;

  const displayNumbers = filtered.slice(seed % Math.max(1, filtered.length - 7));
  const shown = displayNumbers.length > 0 ? displayNumbers : filtered;

  // Open confirm modal instead of purchasing directly
  const handlePurchase = (num: string) => {
    setConfirmNum(num);
  };

  // Launch KYC flow (number reserved, pending KYC)
  const confirmPurchase = () => {
    setKycNum(confirmNum);
    setConfirmNum(null);
  };

  // Called when KYC completes
  const handleKYCComplete = () => {
    if (kycNum) setPurchased(prev => new Set([...prev, kycNum]));
    setKycNum(null);
  };

  const isIndian = selectedCountry.code === 'IN';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '0',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0a0c12',
          minHeight: '100vh',
          width: '100%',
          maxWidth: '960px',
          padding: '48px 48px 80px 48px',
          boxSizing: 'border-box',
          position: 'relative',
          animation: 'shopIn 0.2s ease',
        }}
      >
        <style>{`
          @keyframes shopIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          .num-row:hover { background: rgba(255,255,255,0.04) !important; }
        `}</style>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '20px', right: '20px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#aaa', width: '34px', height: '34px', borderRadius: '8px',
            cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        {/* Title */}
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', margin: '0 0 6px 0' }}>Numbers Shop</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>Browse and purchase phone numbers for your business</p>

        {/* Filters row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
          {/* Country selector */}
          <div style={{ flex: '0 0 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Select a Country
            </label>
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => setCountryOpen(!countryOpen)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', background: '#111827',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                  cursor: 'pointer', fontSize: '13px', color: '#fff', userSelect: 'none',
                }}
              >
                <span>{selectedCountry.flag} {selectedCountry.name}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" style={{ transform: countryOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {countryOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', zIndex: 30, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                  {COUNTRIES.map(c => (
                    <div
                      key={c.code}
                      onClick={() => { setSelectedCountry(c); setCountryOpen(false); setSeed(0); }}
                      style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '13px', color: selectedCountry.code === c.code ? '#00d4c8' : '#e2e8f0', background: selectedCountry.code === c.code ? 'rgba(0,212,200,0.08)' : 'transparent', transition: 'background 0.1s' }}
                      onMouseOver={(e) => { if (selectedCountry.code !== c.code) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                      onMouseOut={(e) => { if (selectedCountry.code !== c.code) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {c.flag} {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pattern search */}
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Search by pattern
            </label>
            <input
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder="e.g. 80xx or 7001-7005"
              style={{ width: '100%', padding: '9px 14px', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(0,212,200,0.5)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>
        </div>

        {/* KYC / Wallet bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            {isIndian && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px' }}>ℹ️</span>
                <span style={{ color: '#00d4c8', fontSize: '13px', fontWeight: 500 }}>
                  KYC verification is required to purchase Indian numbers
                </span>
              </div>
            )}
            <div style={{ fontSize: '12.5px', color: '#64748b' }}>
              Purchase amount will be deducted from your wallet ›{' '}
              <span style={{ color: '#00d4c8', cursor: 'pointer', textDecoration: 'underline' }}>Add funds to wallet ›</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13.5px', color: '#94a3b8', fontWeight: 500 }}>
              Balance: <strong style={{ color: '#fff' }}>$1.18</strong>
            </span>
            {isIndian && (
              <button
                onClick={() => setKycNum('KYC Verification')}
                style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #00d4c8, #00bcd4)', color: '#000', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Complete Instant KYC <span>›</span>
              </button>
            )}
          </div>
        </div>

        {/* Numbers table */}
        <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', padding: '12px 24px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone Number</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Price
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Action</span>
          </div>

          {/* Rows */}
          {shown.map((num, i) => {
            const isPurchased = purchased.has(num);
            return (
              <div
                key={num}
                className="num-row"
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 160px',
                  padding: '14px 24px',
                  borderBottom: i < shown.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: 'transparent',
                  transition: 'background 0.15s',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: 500, letterSpacing: '0.3px' }}>{num}</span>
                <span style={{ fontSize: '14px', color: '#94a3b8' }}>$5.06 / Month</span>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handlePurchase(num)}
                    disabled={isPurchased}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 14px',
                      background: isPurchased ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                      border: isPurchased ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)',
                      color: isPurchased ? '#10b981' : '#e2e8f0',
                      borderRadius: '6px',
                      cursor: isPurchased ? 'default' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseOver={e => { if (!isPurchased) { e.currentTarget.style.background = 'rgba(0,212,200,0.1)'; e.currentTarget.style.borderColor = 'rgba(0,212,200,0.35)'; e.currentTarget.style.color = '#00d4c8'; } }}
                    onMouseOut={e => { if (!isPurchased) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                  >
                    {isPurchased ? (
                      <>✓ Purchased</>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                        Purchase
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '24px' }}>
          <button
            onClick={() => setSeed(s => s + 1)}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: '8px 16px', borderRadius: '6px', transition: 'color 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.color = '#00d4c8')}
            onMouseOut={e => (e.currentTarget.style.color = '#64748b')}
          >
            Listing {shown.length} numbers. Refresh for more.
          </button>
        </div>

        {/* Report Issue */}
        <div style={{ position: 'fixed', bottom: '20px', right: '32px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', background: 'rgba(0,212,200,0.1)', border: '1px solid rgba(0,212,200,0.3)', color: '#00d4c8', borderRadius: '20px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Report Issue
          </button>
        </div>

        {/* ── Purchase Confirm Modal ── */}
        {confirmNum && (
          <div
            onClick={() => setConfirmNum(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(3px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#0f1117',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '14px',
                padding: '28px 28px 24px 28px',
                width: '440px',
                maxWidth: '94vw',
                boxShadow: '0 24px 64px rgba(0,0,0,0.9)',
                animation: 'modalIn 0.16s ease',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>Purchase Number</h2>
                <button
                  onClick={() => setConfirmNum(null)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', padding: '0', lineHeight: 1, marginTop: '-2px' }}
                >✕</button>
              </div>
              <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 24px 0' }}>
                Reserve this number and complete KYC verification
              </p>

              {/* Phone number display */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                  Phone Number
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>
                  {confirmNum}
                </div>
              </div>

              {/* 3-step list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
                {[
                  'Reserve this number instantly',
                  'Complete KYC verification',
                  'Purchase and attach your Voice AI agent',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: 'rgba(0,212,200,0.12)',
                      border: '1px solid rgba(0,212,200,0.3)',
                      color: '#00d4c8',
                      fontSize: '12px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: '13.5px', color: '#e2e8f0', fontWeight: 500 }}>{step}</span>
                  </div>
                ))}
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmNum(null)}
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#94a3b8',
                    borderRadius: '8px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 500,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPurchase}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #00d4c8, #00bcd4)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(0,212,200,0.35)',
                    transition: 'opacity 0.15s, transform 0.1s',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  Reserve &amp; Start KYC
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── KYC Wizard ── */}
        {kycNum && (
          <KYCModal
            phoneNumber={kycNum}
            onClose={() => setKycNum(null)}
            onComplete={handleKYCComplete}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// KYC Modal — 6-step wizard
// ═══════════════════════════════════════════════
const KYC_STEPS = ['Register', 'OTP', 'PAN', 'Aadhar', 'GST', 'Complete'];

function KYCModal({
  phoneNumber,
  onClose,
  onComplete,
}: {
  phoneNumber: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Step 0 — Register
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');

  // Step 1 — Mobile OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Step 2 — PAN
  const [panNumber, setPanNumber] = useState('');
  const [dob, setDob] = useState('');
  const [fatherName, setFatherName] = useState('');

  // Step 3 — Aadhar
  const [aadharNumber, setAadharNumber] = useState('');
  const [aadharOtp, setAadharOtp] = useState('');
  const [aadharOtpSent, setAadharOtpSent] = useState(false);
  const [aadharResendCooldown, setAadharResendCooldown] = useState(0);

  // Step 4 — GST
  const [gstNumber, setGstNumber] = useState('');

  // Uses local proxy prefix configured in Vite (proxies /api to http://localhost:4000/api)
  const API_BASE = '/api/v1';

  const startCountdown = (setter: React.Dispatch<React.SetStateAction<number>>, seconds = 30) => {
    setter(seconds);
    const interval = setInterval(() => {
      setter((prev: number) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // Send OTP to mobile number
  const sendMobileOTP = async () => {
    if (!mobile || mobile.length < 10) {
      showToast('Please enter a valid 10-digit mobile number', 'error');
      return false;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/kyc/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: mobile, type: 'mobile' }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.devOtp) {
          const reasonMsg = data.reason ? `SMS failed: ${data.reason}` : 'SMS not sent in dev';
          showToast(`Dev mode OTP: ${data.devOtp} (${reasonMsg})`, 'info');
        } else {
          showToast(`OTP sent to +91 ${mobile}`, 'success');
        }
        startCountdown(setResendCooldown);
        return true;
      } else {
        showToast(data.error || 'Failed to send OTP', 'error');
        return false;
      }
    } catch {
      showToast('Network error — could not send OTP', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Send OTP to Aadhar-linked mobile
  const sendAadharOTP = async () => {
    if (!aadharNumber || aadharNumber.length < 12) {
      showToast('Please enter a valid 12-digit Aadhar number first', 'error');
      return;
    }
    setLoading(true);
    try {
      // Use the mobile from step 0 as Aadhar-linked number (in real flow, UIDAI would handle this)
      const phone = mobile || '9999999999';
      const res = await fetch(`${API_BASE}/kyc/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, type: 'aadhar' }),
      });
      const data = await res.json();
      if (data.success) {
        setAadharOtpSent(true);
        if (data.devOtp) {
          const reasonMsg = data.reason ? `SMS failed: ${data.reason}` : 'SMS not sent in dev';
          showToast(`Dev mode Aadhar OTP: ${data.devOtp} (${reasonMsg})`, 'info');
        } else {
          showToast(`OTP sent to Aadhar-linked mobile`, 'success');
        }
        startCountdown(setAadharResendCooldown);
      } else {
        showToast(data.error || 'Failed to send Aadhar OTP', 'error');
      }
    } catch {
      showToast('Network error — could not send Aadhar OTP', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Verify mobile OTP before advancing from step 1
  const verifyMobileOTP = async (): Promise<boolean> => {
    const otpVal = otp.join('');
    if (otpVal.length < 6) {
      showToast('Please enter the complete 6-digit OTP', 'error');
      return false;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/kyc/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: mobile, otp: otpVal }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Mobile number verified ✓', 'success');
        return true;
      } else {
        showToast(data.error || 'Invalid OTP', 'error');
        return false;
      }
    } catch {
      showToast('Network error — OTP verification failed', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Verify Aadhar OTP before advancing from step 3
  const verifyAadharOTP = async (): Promise<boolean> => {
    if (!aadharOtpSent) {
      showToast('Please click Send OTP first', 'error');
      return false;
    }
    if (!aadharOtp || aadharOtp.length < 6) {
      showToast('Please enter the 6-digit Aadhar OTP', 'error');
      return false;
    }
    setLoading(true);
    try {
      const phone = mobile || '9999999999';
      const res = await fetch(`${API_BASE}/kyc/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: aadharOtp }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Aadhar verified successfully ✓', 'success');
        return true;
      } else {
        showToast(data.error || 'Invalid Aadhar OTP', 'error');
        return false;
      }
    } catch {
      showToast('Network error — Aadhar verification failed', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Step advance logic
  const next = async () => {
    if (step === 0) {
      // Validate inputs
      if (!fullName.trim()) {
        showToast('Please enter your full name', 'error');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        showToast('Please enter a valid email address', 'error');
        return;
      }
      if (!mobile || mobile.length < 10) {
        showToast('Please enter a 10-digit mobile number', 'error');
        return;
      }
      // Send mobile OTP when moving to step 1
      const sent = await sendMobileOTP();
      if (sent) setStep(1);
    } else if (step === 1) {
      // Verify mobile OTP before step 2
      const verified = await verifyMobileOTP();
      if (verified) setStep(2);
    } else if (step === 2) {
      // Validate PAN fields
      if (!panNumber || panNumber.length < 10) {
        showToast('Please enter a valid 10-character PAN number', 'error');
        return;
      }
      if (!dob) {
        showToast('Please enter your date of birth', 'error');
        return;
      }
      if (!fatherName.trim()) {
        showToast("Please enter your father's name", 'error');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Validate Aadhar and verify OTP
      if (!aadharNumber || aadharNumber.length < 12) {
        showToast('Please enter a valid 12-digit Aadhar number', 'error');
        return;
      }
      const verified = await verifyAadharOTP();
      if (verified) setStep(4);
    } else {
      setStep(s => Math.min(s + 1, 5));
    }
  };

  const prev = () => setStep(s => Math.max(s - 1, 0));


  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13.5px',
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: '8px',
  };

  const hintStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '6px',
  };

  const focus = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = 'rgba(0,212,200,0.5)');
  const blur  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)');

  const renderStep = () => {
    switch (step) {

      case 0: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }}>Your Details</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Enter your legal details as per government records</p>
          </div>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Prachi Dongare" style={inputStyle} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>Enter your name exactly as it appears on your PAN card</p>
          </div>
          <div>
            <label style={labelStyle}>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="prachidongare02@gmail.com" style={inputStyle} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>Use an active email you have access to for OTP verification</p>
          </div>
          <div>
            <label style={labelStyle}>Mobile Number</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>+91</div>
              <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="9876543210" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <p style={hintStyle}>Enter your mobile number and we will call you on this number for OTP verification</p>
          </div>
        </div>
      );

      case 1: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }}>Verify OTP</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Enter the 6-digit OTP sent to +91 {mobile || 'your mobile'}</p>
          </div>
          <div style={{ width: '100%' }}>
            <label style={{ ...labelStyle, textAlign: 'center' }}>One-Time Password</label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '12px 0' }}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-kyc-${i}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    const newOtp = [...otp]; newOtp[i] = val; setOtp(newOtp);
                    if (val && i < 5) (document.getElementById(`otp-kyc-${i + 1}`) as HTMLInputElement)?.focus();
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Backspace' && !otp[i] && i > 0)
                      (document.getElementById(`otp-kyc-${i - 1}`) as HTMLInputElement)?.focus();
                  }}
                  style={{ width: '46px', height: '52px', textAlign: 'center', background: '#111827', border: digit ? '2px solid rgba(0,212,200,0.6)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '20px', fontWeight: 700, outline: 'none' }}
                />
              ))}
            </div>
            <p style={hintStyle}>
              Didn't receive OTP?{' '}
              {resendCooldown > 0 ? (
                <span style={{ color: '#64748b' }}>Resend in {resendCooldown}s</span>
              ) : (
                <span
                  onClick={sendMobileOTP}
                  style={{ color: '#00d4c8', cursor: 'pointer', fontWeight: 600 }}
                >
                  Resend OTP
                </span>
              )}
            </p>
          </div>
        </div>
      );

      case 2: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }}>PAN Verification</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Verify your identity using your Permanent Account Number</p>
          </div>
          <div>
            <label style={labelStyle}>PAN Number</label>
            <input value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} style={inputStyle} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>10-character alphanumeric PAN card number</p>
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>As mentioned on your PAN card</p>
          </div>
          <div>
            <label style={labelStyle}>Father's Name</label>
            <input value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder="Enter father's name" style={inputStyle} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>As it appears on your PAN card</p>
          </div>
        </div>
      );

      case 3: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }}>Aadhar Verification</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Link your Aadhar number for identity verification</p>
          </div>
          <div>
            <label style={labelStyle}>Aadhar Number</label>
            <input value={aadharNumber} onChange={e => setAadharNumber(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="1234 5678 9012" style={inputStyle} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>12-digit Aadhar number (no spaces)</p>
          </div>
          <div>
            <label style={labelStyle}>Aadhar OTP</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input value={aadharOtp} onChange={e => setAadharOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter OTP from registered mobile" style={inputStyle} onFocus={focus} onBlur={blur} />
              <button
                onClick={sendAadharOTP}
                disabled={loading || aadharResendCooldown > 0}
                style={{
                  padding: '12px 18px',
                  background: 'rgba(0,212,200,0.1)',
                  border: '1px solid rgba(0,212,200,0.3)',
                  color: '#00d4c8',
                  borderRadius: '8px',
                  cursor: (loading || aadharResendCooldown > 0) ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  opacity: (loading || aadharResendCooldown > 0) ? 0.6 : 1,
                }}
              >
                {aadharResendCooldown > 0 ? `Resend in ${aadharResendCooldown}s` : 'Send OTP'}
              </button>
            </div>
            <p style={hintStyle}>OTP will be sent to your Aadhar-linked mobile number</p>
          </div>
          <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', padding: '12px 14px', display: 'flex', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#fbbf24', lineHeight: 1.5 }}>Your Aadhar details are encrypted and stored securely in compliance with UIDAI guidelines.</p>
          </div>
        </div>
      );

      case 4: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }}>GST Details</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Provide your GST number for business registration (optional)</p>
          </div>
          <div>
            <label style={labelStyle}>GST Number <span style={{ fontWeight: 400, color: '#64748b' }}>(Optional)</span></label>
            <input value={gstNumber} onChange={e => setGstNumber(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} style={inputStyle} onFocus={focus} onBlur={blur} />
            <p style={hintStyle}>15-character GSTIN — leave blank if not registered under GST</p>
          </div>
          <div style={{ background: 'rgba(0,212,200,0.05)', border: '1px solid rgba(0,212,200,0.15)', borderRadius: '8px', padding: '14px' }}>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.6 }}>GST details are used for tax invoices. Adding a GST number enables you to claim input tax credit on your purchases.</p>
          </div>
        </div>
      );

      case 5: return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '8px 0' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #00d4c8, #00bcd4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(0,212,200,0.4)', fontSize: '30px' }}>✓</div>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '0 0 8px 0' }}>KYC Complete!</h3>
            <p style={{ color: '#64748b', fontSize: '13.5px', margin: 0, lineHeight: 1.6 }}>
              Your KYC has been submitted successfully.<br />
              <strong style={{ color: '#00d4c8' }}>{phoneNumber}</strong> has been reserved for your account.
            </p>
          </div>
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden' }}>
            {[
              { label: 'Name', value: fullName || '—' },
              { label: 'Email', value: email || '—' },
              { label: 'PAN', value: panNumber || '—' },
              { label: 'Phone Number', value: phoneNumber },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ color: '#64748b', fontSize: '13px' }}>{row.label}</span>
                <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000,
        overflowY: 'auto',
        padding: '24px 0',
      }}
    >
      <div
        style={{
          background: '#0a0c12',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          width: '580px',
          maxWidth: '96vw',
          padding: '32px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
          animation: 'modalIn 0.18s ease',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <style>{`
          @keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
          @keyframes toastIn{from{opacity:0;transform:translate(-50%, 8px)}to{opacity:1;transform:translate(-50%, 0)}}
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff' }}>Instant KYC Verification</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>{phoneNumber}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '20px', padding: 0, lineHeight: 1, marginTop: '-2px' }}>✕</button>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '16px 0 20px' }} />

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '28px' }}>
          {KYC_STEPS.map((label, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < KYC_STEPS.length - 1 ? '1' : '0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%',
                    background: isActive ? '#00d4c8' : isDone ? 'rgba(0,212,200,0.15)' : '#1e293b',
                    border: isActive ? 'none' : isDone ? '1px solid rgba(0,212,200,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    color: isActive ? '#000' : isDone ? '#00d4c8' : '#64748b',
                    fontSize: '12px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.3s',
                  }}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: isActive ? 700 : 400, color: isActive ? '#00d4c8' : '#64748b', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {i < KYC_STEPS.length - 1 && (
                  <div style={{ flex: 1, height: '1px', background: isDone ? 'rgba(0,212,200,0.4)' : 'rgba(255,255,255,0.07)', margin: '0 4px', marginBottom: '16px', transition: 'background 0.3s' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div style={{ minHeight: '260px' }}>{renderStep()}</div>

        {/* Navigation */}
        <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {step < 5 ? (
            <>
              <button
                onClick={next}
                disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  background: 'linear-gradient(135deg, #00d4c8, #00bcd4)',
                  color: '#000', border: 'none', borderRadius: '10px',
                  cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 700,
                  boxShadow: '0 4px 20px rgba(0,212,200,0.3)',
                  transition: 'opacity 0.15s, transform 0.1s',
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseOver={e => { if (!loading) { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                onMouseOut={e => { if (!loading) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; } }}
              >
                {loading ? 'Processing...' : step === 4 ? 'Submit KYC' : 'Continue'}
              </button>
              {step > 0 && (
                <button onClick={prev} disabled={loading} style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 500, opacity: loading ? 0.6 : 1 }}>
                  Back
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onComplete}
              style={{
                width: '100%', padding: '14px',
                background: 'linear-gradient(135deg, #00d4c8, #00bcd4)',
                color: '#000', border: 'none', borderRadius: '10px',
                cursor: 'pointer', fontSize: '15px', fontWeight: 700,
                boxShadow: '0 4px 20px rgba(0,212,200,0.3)',
              }}
            >
              Activate Number
            </button>
          )}
        </div>

        {/* Floating Toast Notification inside the modal */}
        {toast && (
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#00d4c8',
            color: '#000',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'toastIn 0.2s ease',
          }}>
            <span>{toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✓' : 'ℹ️'}</span>
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════
export default function PhoneNumbers() {
  const [modal, setModal] = useState<ModalType>(null);

  const [twilioForm, setTwilioForm] = useState<TwilioForm>({
    name: '', phoneNumber: '', accountSid: '', accountToken: '',
  });
  const [exotelForm, setExotelForm] = useState<ExotelForm>({
    name: '', phoneNumber: '', apiKey: '', apiToken: '', subdomain: '', accountSid: '', appId: '',
  });
  const [sipForm, setSipForm] = useState<SipForm>({
    name: '', provider: '', phoneNumber: '', sipHost: '', sipPort: '5060', username: '', password: '',
  });

  const closeModal = () => setModal(null);

  const importBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.2s, border-color 0.2s',
  };

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Phone Numbers</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your phone numbers and attached bots
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* Buy a Phone Number Card */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', margin: 0 }}>
              <span style={{ color: 'var(--teal)' }}>📞</span> Buy a Phone Number
            </h3>
            <span style={{ background: 'rgba(220,100,0,0.2)', color: '#fb923c', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>New</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
            Instantly get a phone number for calling, campaigns, and connecting with your customers.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px', flexGrow: 1 }}>
            <div style={{ border: '1px solid rgba(0,212,200,0.3)', borderRadius: '6px', padding: '16px', background: 'rgba(0,212,200,0.05)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '8px', color: 'white' }}>
                <span style={{ color: 'var(--teal)' }}>🤖</span> Connect Agents &amp; Campaigns
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                Assign phone numbers to your AI agents for seamless voice interactions and scale your outreach with outbound campaigns.
              </p>
            </div>
            <div style={{ border: '1px solid rgba(251,146,60,0.3)', borderRadius: '6px', padding: '16px', background: 'rgba(251,146,60,0.05)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '8px', color: 'white' }}>
                <span style={{ color: '#fb923c' }}>🌐</span> Global Coverage
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                We offer both Indian <strong style={{ color: '#10b981' }}>(+91)</strong> and US <strong style={{ color: '#10b981' }}>(+1)</strong> numbers. Check out our inventory!
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '14px' }}
            onClick={() => setModal('buy')}
          >
            Buy Number Now <span style={{ marginLeft: '4px' }}>→</span>
          </button>
        </div>

        {/* Import Existing Number Card */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', margin: '0 0 8px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📥</span> Import Existing Number
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
            Already have a provider? Bring your own numbers to our platform seamlessly.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              style={importBtnStyle}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(0,212,200,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              onClick={() => setModal('twilio')}
            >
              <span style={{ color: 'var(--teal)', fontSize: '18px' }}>📞</span> Import from Twilio
            </button>
            <button
              style={importBtnStyle}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(0,212,200,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              onClick={() => setModal('exotel')}
            >
              <span style={{ color: 'var(--teal)', fontSize: '18px' }}>📞</span> Import from Exotel
            </button>
            <button
              style={importBtnStyle}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(0,212,200,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              onClick={() => setModal('sip')}
            >
              <span style={{ color: 'var(--teal)', fontSize: '18px' }}>📞</span> Import from SIP Trunk
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '36px', opacity: 0.8 }}>📞</div>
        <h3 style={{ fontSize: '18px', marginBottom: '8px', fontWeight: 600 }}>No phone numbers yet</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Purchase your first phone number to get started</p>
      </div>

      {/* ── Twilio Modal ── */}
      {modal === 'twilio' && (
        <NarrowModal title="Import Twilio Number" icon="📞" onClose={closeModal} onSubmit={closeModal}>
          <Field label="Name" value={twilioForm.name} onChange={(v) => setTwilioForm({ ...twilioForm, name: v })} placeholder="Enter a name for this number" />
          <PhoneField value={twilioForm.phoneNumber} onChange={(v) => setTwilioForm({ ...twilioForm, phoneNumber: v })} />
          <Field label="Account SID" value={twilioForm.accountSid} onChange={(v) => setTwilioForm({ ...twilioForm, accountSid: v })} placeholder="Enter your Twilio Account SID" />
          <Field label="Account Token" value={twilioForm.accountToken} onChange={(v) => setTwilioForm({ ...twilioForm, accountToken: v })} placeholder="Enter your Twilio Account Token" type="password" />
        </NarrowModal>
      )}

      {/* ── Exotel Modal (wide, two-column) ── */}
      {modal === 'exotel' && (
        <ExotelModal
          onClose={closeModal}
          onSubmit={closeModal}
          form={exotelForm}
          setForm={setExotelForm}
        />
      )}

      {/* ── SIP Trunk Modal ── */}
      {modal === 'sip' && (
        <SipTrunkModal
          onClose={closeModal}
          onSubmit={closeModal}
          form={sipForm}
          setForm={setSipForm}
        />
      )}

      {/* ── Numbers Shop Modal ── */}
      {modal === 'buy' && (
        <NumbersShopModal onClose={closeModal} />
      )}
    </>
  );
}
