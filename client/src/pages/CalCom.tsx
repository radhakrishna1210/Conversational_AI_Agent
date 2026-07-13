import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';

const responsiveStyles = `
  @media (max-width: 600px) {
    .calcom-wrapper {
      padding: 28px 16px 64px !important;
    }
    .calcom-header {
      flex-direction: column !important;
      gap: 16px !important;
      margin-bottom: 24px !important;
    }
    .calcom-logo {
      font-size: 38px !important;
    }
    .calcom-title-block {
      padding-top: 0 !important;
    }
    .calcom-title {
      font-size: 18px !important;
    }
    .calcom-cta-block {
      padding: 24px 20px !important;
    }
    .calcom-cta-title {
      font-size: 20px !important;
    }
    .calcom-cta-buttons {
      flex-direction: column !important;
      gap: 10px !important;
    }
    .calcom-cta-buttons a {
      justify-content: center !important;
    }
    .calcom-integrations-grid {
      grid-template-columns: 1fr !important;
      gap: 24px !important;
    }
  }

  @media (min-width: 601px) and (max-width: 860px) {
    .calcom-wrapper {
      padding: 36px 20px 80px !important;
    }
    .calcom-logo {
      font-size: 44px !important;
    }
    .calcom-cta-block {
      padding: 28px !important;
    }
    .calcom-cta-title {
      font-size: 22px !important;
    }
    .calcom-integrations-grid {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 20px !important;
    }
  }
`;

function CalLogo() {
  return (
    <div className="calcom-logo" style={{ fontSize: 52, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-2px', lineHeight: 1 }}>
      Cal.com
    </div>
  );
}

function GoogleCalIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#FF7A59', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

function SalesforceIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#00A1E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
        <path d="M10 2C11 0 13.5 0 13.5 0S16 0 17.5 2C17.5 2 19 1 20.5 1.5C22 2 23 3.5 23 5C23 5 24 5.5 24 7C24 9 22 10 22 10H2C2 10 0 9 0 7C0 5 1.5 4 1.5 4S1.5 2 3 1C4.5 0 6 1 6 1S7 2 10 2Z" fill="white" />
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
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
      color: 'var(--text-secondary)', marginBottom: 14,
    }}>
      {text}
    </div>
  );
}

export default function CalCom() {
  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <style>{responsiveStyles}</style>
      <div className="calcom-wrapper" style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 100px' }}>

        {/* Logo + title */}
        <div className="calcom-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 28, marginBottom: 32 }}>
          <CalLogo />
          <div className="calcom-title-block" style={{ paddingTop: 6 }}>
            <div className="calcom-title" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Cal.com</div>
            <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              Schedule meetings on your Cal.com calendar from a voice conversation.
            </div>
          </div>
        </div>

        {/* Intro */}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 40 }}>
          Cal.com integration lets your agent access your calendar and schedule meetings on your behalf,
          creating a seamless scheduling experience for callers. Configure the integration once and attach it to any agent.
        </p>

        {/* Key Benefits */}
        <div style={{ marginBottom: 36 }}>
          <SectionLabel text="Key Benefits" />
          <BulletItem text="Automated meeting scheduling" />
          <BulletItem text="Calendar availability checking" />
          <BulletItem text="Streamlined appointment booking process" />
        </div>

        {/* Common Use Cases */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel text="Common Use Cases" />
          <BulletItem text="Sales agents booking discovery calls during inbound conversations" />
          <BulletItem text="Service businesses taking phone bookings 24/7" />
          <BulletItem text="Customer success teams handing off to a scheduled call" />
        </div>

        {/* Docs card */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px', marginBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Full setup guide on our docs
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.65 }}>
            Step-by-step instructions with screenshots, including dashboard setup and agent-side configuration.
          </div>
          <Link to="/documentation" style={{ fontSize: 13, fontWeight: 600, color: '#0eb39e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Read the Cal.com setup guide <ArrowRight size={13} />
          </Link>
        </div>

        {/* CTA */}
        <div className="calcom-cta-block" style={{
          border: '1px solid var(--border)', borderRadius: 16, padding: '36px', marginBottom: 56,
          background: 'linear-gradient(135deg, rgba(14,179,158,0.08) 0%, rgba(14,179,158,0.02) 100%)',
          position: 'relative' as const, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute' as const, top: -30, right: -30, width: 180, height: 180,
            background: 'radial-gradient(circle, rgba(14,179,158,0.18) 0%, transparent 70%)',
            pointerEvents: 'none' as const,
          }} />
          <h2 className="calcom-cta-title" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.5px' }}>
            Build a voice agent that uses Cal.com
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24, maxWidth: 480 }}>
            Start free, configure the Cal.com connection from the dashboard, and launch your first agent in minutes.
          </p>
          <div className="calcom-cta-buttons" style={{ display: 'flex', gap: 12 }}>
            <Link to="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 24,
              background: '#0eb39e', color: '#fff',
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}>
              Start free <ArrowRight size={14} />
            </Link>
            <Link to="/book-appointment" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 24,
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              background: 'transparent',
            }}>
              Book a demo <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* More integrations */}
        <div>
          <SectionLabel text="More Calendar &amp; CRM Integrations" />
          <div className="calcom-integrations-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
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
            <div>
              <div style={{ marginBottom: 10 }}><SalesforceIcon /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Salesforce</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Update Salesforce contacts, leads, and opportunities from...
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
