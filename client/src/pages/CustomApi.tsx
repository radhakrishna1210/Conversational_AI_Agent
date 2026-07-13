import { Link } from 'react-router-dom';
import { Check, ArrowRight, Play, Webhook, Globe } from 'lucide-react';


function CustomApiLogo() {
  return (
    <div
      style={{
        width: 'clamp(56px,10vw,70px)',
        height: 'clamp(56px,10vw,70px)',
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <img
        src="https://www.shutterstock.com/image-vector/api-application-interface-icon-simple-260nw-2188533787.jpg"
        alt="Custom API"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

function WebhookIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#3b1f6e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Webhook size={20} style={{ color: '#c084fc' }} />
    </div>
  );
}

function WebSearchIcon() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#1a3a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Globe size={20} style={{ color: '#0eb39e' }} />
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

function VideoCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', width:'100%', maxWidth:320, transition: 'border-color 0.2s' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(14,179,158,0.4)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
    >
      <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg, #0d1525 0%, #162136 50%, #1a2740 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' as const, overflow: 'hidden' }}>
        <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>VIDEO</div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(14,179,158,0.15)', border: '1px solid rgba(14,179,158,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={12} fill="#0eb39e" style={{ color: '#0eb39e', marginLeft: 2 }} />
          </div>
        </div>
        <div style={{ position: 'absolute' as const, bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)', padding: '20px 10px 10px', fontSize: 11, fontWeight: 700, color: 'white', lineHeight: 1.4 }}>
          {title}
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        {subtitle && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>{subtitle}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#0eb39e', fontWeight: 600 }}>
          <Play size={10} fill="#0eb39e" style={{ color: '#0eb39e' }} /> Play
        </div>
      </div>
    </div>
  );
}

export default function CustomApi() {
  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <div style={{ width:'100%', maxWidth:760, margin:'0 auto', padding:'clamp(24px,5vw,48px) clamp(16px,4vw,24px) 80px', boxSizing:'border-box' }}>

        {/* Logo + title row */}
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:20, marginBottom:32 }}>
          <CustomApiLogo />
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize:'clamp(24px,5vw,28px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.5px' }}>Custom API</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Connect your agent to any external REST API endpoint.
            </div>
          </div>
        </div>

        {/* Intro */}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 40 }}>
          The Custom API integration lets your agent call any external service in real time or post-call. Use it to access your own backend, look up live data during a conversation, or extend the agent's capabilities with custom functionality.
        </p>

        {/* Key Benefits */}
        <div style={{ marginBottom: 36 }}>
          <SectionLabel text="Key Benefits" />
          <BulletItem text="Access external data sources in real-time" />
          <BulletItem text="Connect to your own backend services" />
          <BulletItem text="Integrate with virtually any REST API endpoint" />
          <BulletItem text="Extend your agent's capabilities with custom functionality" />
        </div>

        {/* Common Use Cases */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel text="Common Use Cases" />
          <BulletItem text="Look up customer records from an internal API during the call" />
          <BulletItem text="Trigger backend workflows immediately after the call ends" />
          <BulletItem text="Connect to services that don't have a native integration here" />
        </div>

        {/* Video Walkthroughs */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel text="Video Walkthroughs" />
          <VideoCard
            title="Connect Your Voice AI Agent to Any Custom Apps Using APIs"
            subtitle="Connect agent to custom apps via API"
          />
        </div>

        {/* Docs card */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding:'clamp(18px,4vw,28px)', marginBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Full setup guide on our docs</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.65 }}>
            Step-by-step instructions with screenshots, including dashboard setup and agent-side configuration.
          </div>
          <Link to="/documentation" style={{ fontSize: 13, fontWeight: 600, color: '#0eb39e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Read the Custom API setup guide <ArrowRight size={13} />
          </Link>
        </div>

        {/* CTA banner */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding:'clamp(20px,5vw,36px)', marginBottom: 56, background: 'linear-gradient(135deg, rgba(14,179,158,0.08) 0%, rgba(14,179,158,0.02) 100%)', position: 'relative' as const, overflow: 'hidden' }}>
          <div style={{ position: 'absolute' as const, top: -30, right: -30, width: 180, height: 180, background: 'radial-gradient(circle, rgba(14,179,158,0.18) 0%, transparent 70%)', pointerEvents: 'none' as const }} />
          <h2 style={{ fontSize:'clamp(22px,5vw,26px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.5px' }}>
            Build a voice agent that uses Custom API
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24, maxWidth: 480 }}>
            Start free, configure the Custom API connection from the dashboard, and launch your first agent in minutes.
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
          <SectionLabel text="More Custom &amp; Tools Integrations" />
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
            <div>
              <div style={{ marginBottom: 10 }}><WebhookIcon /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Webhook</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Send post-call payloads to any HTTPS endpoint.
              </div>
            </div>
            <div>
              <div style={{ marginBottom: 10 }}><WebSearchIcon /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Web Search</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Give your agent live web-search capability inside...
              </div>
            </div>
            <div />
          </div>
        </div>

      </div>
    </div>
  );
}