import { Link } from 'react-router-dom';
import { User, ArrowRight, Bot, PhoneCall, Radio, FileText, CreditCard, ShieldCheck, Zap, HelpCircle } from 'lucide-react';

export default function DocsHome() {
  return (
    <div className="docs-home" style={{ maxWidth: 880 }}>
      {/* Hero section */}
      <div style={{ marginBottom: 36 }}>
        <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Spandan Documentation</div>
        <h1 className="rz-h1" style={{ fontSize: 'clamp(32px, 5vw, 44px)', marginBottom: 16 }}>Spandan Documentation Portal</h1>
        <p className="rz-sub-lg" style={{ color: 'var(--text-secondary)', fontSize: 17, lineHeight: 1.6 }}>
          Learn how to deploy conversational Voice AI agents, verify caller IDs, ground replies in business files, run high-volume bulk calling campaigns, and integrate programmatic REST APIs.
        </p>
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 36 }}></div>

      {/* Main path banner */}
      <div style={{ marginBottom: 44 }}>
        {/* User Guides */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: 'border-color 0.2s',
          cursor: 'pointer'
        }} className="docs-home-card">
          <div>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: 'rgba(14, 179, 158, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--teal)',
              marginBottom: 16
            }}>
              <User size={24} />
            </div>
            <h2 style={{ fontSize: 20, color: 'var(--text-primary)', marginBottom: 8, fontWeight: 600 }}>User Documentation & Guides</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              Comprehensive step-by-step guides detailing how to create agents, upload knowledge files, manage contact clusters, launch bulk campaigns, verify caller IDs, and manage prepaid wallet balances.
            </p>
          </div>
          <Link to="/docs/user/overview" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--teal-fg)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600
          }}>
            <span>Explore User Documentation</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Featured User Guides Grid */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 16, fontWeight: 600 }}>Essential User Guides</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14, marginBottom: 40 }} className="docs-home-links">
        <Link to="/docs/user/getting-started" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <Zap size={18} style={{ color: 'var(--teal)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Quick Start Guide</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>First agent to live phone call</div>
          </div>
        </Link>

        <Link to="/docs/user/agents" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <Bot size={18} style={{ color: 'var(--cyan-fg)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Creating AI Agents</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Prompts, voices, and settings</div>
          </div>
        </Link>

        <Link to="/docs/user/bulk-campaigns" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <PhoneCall size={18} style={{ color: 'var(--lime)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Bulk Call Campaigns</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Outbound dialers & rotation</div>
          </div>
        </Link>

        <Link to="/docs/user/voice-broadcast" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <Radio size={18} style={{ color: 'var(--coral)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Voice Broadcast</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>One-way announcements</div>
          </div>
        </Link>

        <Link to="/docs/user/knowledge-base" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <FileText size={18} style={{ color: 'var(--violet)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Knowledge Base</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>RAG vector document grounding</div>
          </div>
        </Link>

        <Link to="/docs/user/phone-numbers" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <ShieldCheck size={18} style={{ color: 'var(--teal)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Phone Numbers & DLT</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>TRAI compliance & caller IDs</div>
          </div>
        </Link>

        <Link to="/docs/user/billing" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <CreditCard size={18} style={{ color: 'var(--lime)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>Billing & Wallet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Prepaid balance & Razorpay</div>
          </div>
        </Link>

        <Link to="/docs/user/faq" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <HelpCircle size={18} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13.5 }}>FAQ & Glossary</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Common questions & definitions</div>
          </div>
        </Link>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .docs-home-card:hover {
          border-color: var(--teal) !important;
        }
      `}} />
    </div>
  );
}
