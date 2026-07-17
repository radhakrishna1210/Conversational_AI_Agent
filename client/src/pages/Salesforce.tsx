import { Link } from 'react-router-dom';
import { Check, ChevronRight, ArrowRight, Play } from 'lucide-react';

function SalesforceLogo() {
  return (
    <div
      style={{
        width:'clamp(60px,10vw,80px)',
        height:'clamp(60px,10vw,80px)',
        borderRadius: 8,
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <img
        src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSbqfj5ILf0nEEjj0VBoGwlcVCGd9alfLC_Rw&s"
        alt="Salesforce"
        style={{
          width:'100%',
          height:'100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

function CalComIcon() {
  return (
    <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1 }}>Cal.com</span>
    </div>
  );
}

function GoogleCalIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="3" y="3" width="9" height="9" rx="1" fill="#4285F4" />
        <rect x="14" y="3" width="9" height="9" rx="1" fill="#EA4335" />
        <rect x="3" y="14" width="9" height="9" rx="1" fill="#34A853" />
        <rect x="14" y="14" width="9" height="9" rx="1" fill="#FBBC05" />
      </svg>
    </div>
  );
}

function HubSpotIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#FF7A59', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="8" r="3" fill="white" />
        <circle cx="16" cy="14" r="2.5" fill="white" />
        <circle cx="6" cy="14" r="2.5" fill="white" />
        <line x1="11" y1="11" x2="16" y2="14" stroke="white" strokeWidth="1.5" />
        <line x1="11" y1="11" x2="6" y2="14" stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
      <Check size={15} style={{ color: '#0eb39e', marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', marginBottom: 14 }}>
      {text}
    </div>
  );
}

function VideoCard({ title, subtitle, thumbnail }: { title: string; subtitle?: string; thumbnail: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(14,179,158,0.4)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
    >
      {/* Thumbnail */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a2740', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' as const, overflow: 'hidden' }}>
        <div style={{ position: 'absolute' as const, inset: 0, background: thumbnail, opacity: 0.7 }} />
        <div style={{
          position: 'relative' as const, width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.25)',
        }}>
          <Play size={14} fill="white" style={{ color: 'white', marginLeft: 2 }} />
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{subtitle}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: '#0eb39e', fontWeight: 600 }}>
          <Play size={10} fill="#0eb39e" style={{ color: '#0eb39e' }} /> Play
        </div>
      </div>
    </div>
  );
}

export default function Salesforce() {
  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <div style={{ width:'100%', maxWidth:760, margin:'0 auto', padding:'clamp(24px,5vw,48px) clamp(16px,4vw,24px) 80px', boxSizing:'border-box' }}>

      

        {/* Logo + title row */}
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:20, marginBottom:32 }}>
          <SalesforceLogo />
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize:'clamp(24px,5vw,28px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.5px' }}>Salesforce</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Update Salesforce contacts, leads, and opportunities from call outcomes.
            </div>
          </div>
        </div>

        {/* Intro */}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 40 }}>
          Connect your Salesforce CRM with OmniDimension to automatically update CRM records after a call. Create or update Contacts, Accounts, and Opportunities based on variables extracted from the conversation.
        </p>

        {/* Key Benefits */}
        <div style={{ marginBottom: 36 }}>
          <SectionLabel text="Key Benefits" />
          <BulletItem text="Automatically update CRM records after a call" />
          <BulletItem text="Streamline lead management workflows" />
          <BulletItem text="Create or update Contacts, Accounts, and Opportunities from extracted variables" />
        </div>

        {/* Common Use Cases */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel text="Common Use Cases" />
          <BulletItem text="Outbound SDR agents logging every call to the right Lead" />
          <BulletItem text="Inbound support agents pulling Account history mid-call" />
          <BulletItem text="Renewal agents updating Opportunity stage from the conversation" />
        </div>

        {/* Video Walkthroughs */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel text="Video Walkthroughs" />
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
            <VideoCard
              title="Automate lead generation (CRM and Sheets)"
              thumbnail="linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
            />
            <VideoCard
              title="Dispatch voice AI calls from your CRM or Google Sheets"
              thumbnail="linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1c2b3a 100%)"
            />
          </div>
        </div>

        {/* Docs card */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding:'clamp(18px,4vw,28px)', marginBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Full setup guide on our docs</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.65 }}>
            Step-by-step instructions with screenshots, including dashboard setup and agent-side configuration.
          </div>
          <Link to="/documentation" style={{ fontSize: 13, fontWeight: 600, color: '#0eb39e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Read the Salesforce setup guide <ArrowRight size={13} />
          </Link>
        </div>

        {/* CTA banner */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding:'clamp(20px,5vw,36px)', marginBottom: 56, background: 'linear-gradient(135deg, rgba(14,179,158,0.08) 0%, rgba(14,179,158,0.02) 100%)', position: 'relative' as const, overflow: 'hidden' }}>
          <div style={{ position: 'absolute' as const, top: -30, right: -30, width: 180, height: 180, background: 'radial-gradient(circle, rgba(14,179,158,0.18) 0%, transparent 70%)', pointerEvents: 'none' as const }} />
          <h2 style={{ fontSize:'clamp(22px,5vw,26px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.5px' }}>
            Build a voice agent that uses Salesforce
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24, maxWidth: 480 }}>
            Start free, configure the Salesforce connection from the dashboard, and launch your first agent in minutes.
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
            <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 24, background: '#0eb39e', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Start free <ArrowRight size={14} />
            </Link>
            <Link to="/book-appointment" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 24, border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, textDecoration: 'none', background: 'transparent' }}>
              Book a demo <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* More integrations */}
        <div>
          <SectionLabel text="More Calendar &amp; CRM Integrations" />
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
            <Link to="/integrations/cal-com" style={{ textDecoration: 'none' }}>
              <div style={{ marginBottom: 10 }}><CalComIcon /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Cal.com</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Schedule meetings on your Cal.com calendar from a voice...
              </div>
            </Link>
            <div>
              <div style={{ marginBottom: 10 }}><GoogleCalIcon /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Google Calendar</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Read availability and write bookings to Google Calendar.
              </div>
            </div>
            <div>
              <div style={{ marginBottom: 10 }}><HubSpotIcon /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>HubSpot</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Automatically sync post-call data into HubSpot. Contacts,...
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}