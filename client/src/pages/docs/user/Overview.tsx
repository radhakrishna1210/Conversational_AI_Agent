import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Bot, PhoneCall, Radio, FileText, Zap, Database } from 'lucide-react';

export default function UserOverview() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Getting Started</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Platform Overview</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Spandan is a carrier-grade Conversational Voice AI and Omnichannel Outreach platform built to automate natural, low-latency business phone calls and WhatsApp conversations without human intervention.
      </p>

      {/* Overview Section */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. What is Spandan?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan provides intelligent, human-sounding virtual voice agents that execute complex voice workflows. Whether handling inbound customer queries, running outbound lead qualification dialers, collecting debt reminders, or broadcasting emergency voice updates, Spandan automates high-volume telephony with sub-second response times and contextual business intelligence.
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        Unlike traditional Interactive Voice Response (IVR) systems that force callers through rigid numerical keypad menus, Spandan conversational agents listen in real-time, interpret intent, ground their knowledge in uploaded company documents, extract key structured variables during conversation, and seamlessly trigger downstream CRM workflows.
      </p>

      <DocsImage
        src="/screenshots/Home_page.png"
        alt="Spandan Conversational Voice AI Platform Landing Page"
        caption="Spandan platform interface: natural conversational AI agent deployment and outreach workflows"
      />

      {/* Visual Workflow: High-Level Platform Architecture */}
      <DocsWorkflow
        title="Spandan End-to-End Operational Lifecycle"
        description="How customer data, AI models, telephony infrastructure, and business integrations connect across the platform."
        steps={[
          {
            badge: '01. CONFIGURE',
            title: 'Create AI Agent',
            description: 'Define system prompts, pick natural voices, configure speech-to-text, and attach knowledge base files.',
            icon: <Bot size={16} />
          },
          {
            badge: '02. AUDIENCE',
            title: 'Prepare Contacts',
            description: 'Upload CSV lists into deduplicated Contact Clusters with normalized E.164 phone numbers.',
            icon: <Database size={16} />
          },
          {
            badge: '03. TELEPHONY',
            title: 'Execute Outreach',
            description: 'Launch Bulk Conversational Campaigns or Voice Broadcasts with verified caller IDs.',
            icon: <PhoneCall size={16} />
          },
          {
            badge: '04. SETTLE',
            title: 'Inspect & Integrate',
            description: 'Review synchronized transcripts, audio waveforms, extracted JSON data, and automated CRM webhooks.',
            icon: <Zap size={16} />
          }
        ]}
      />

      {/* Core Capabilities */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>2. Core Platform Capabilities</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--teal)', fontWeight: 600, marginBottom: '8px' }}>
            <Bot size={18} />
            <span>Voice AI Assistants</span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Create conversational agents powered by leading LLMs (Gemini 2.5 Flash, GPT-4.1 Mini, Grok) with custom greetings, multi-language support, interruption handling, and ambient background noise.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--cyan-fg)', fontWeight: 600, marginBottom: '8px' }}>
            <PhoneCall size={18} />
            <span>Bulk Call Campaigns</span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Run large-scale automated two-way voice campaigns with caller ID rotation, automatic deduplication, scheduling windows, and live real-time dial progression.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--coral)', fontWeight: 600, marginBottom: '8px' }}>
            <Radio size={18} />
            <span>Voice Broadcast</span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Deliver one-way audio announcements using studio recordings or text-to-speech scripts to entire contact lists at dedicated per-minute talk-time rates.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--lime)', fontWeight: 600, marginBottom: '8px' }}>
            <FileText size={18} />
            <span>RAG Knowledge Grounding</span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Upload PDFs, spreadsheets, and manuals. Spandan chunks text and generates 1536-dimension pgvector embeddings to ensure zero hallucination during calls.
          </p>
        </div>
      </div>

      <DocsImage
        src="/screenshots/voice-ai-overview.png"
        alt="Spandan Voice AI Assistants Hub"
        caption="Voice AI Assistants command center: assistant cards, models, voice profiles, and action controls"
      />

      <DocsScreenshotPlaceholder
        title="Spandan Unified Workspace Navigation"
        description="The sidebar organizes the user experience into intuitive operational categories: Voice AI Setup, Operations & Monitoring, Chat, and Account & Billing."
        routePath="/dashboard"
        elements={[
          { label: 'Voice AI Setup', value: 'Assistants, Clone Voice, Files, Integrations', type: 'text' },
          { label: 'Operations', value: 'Phone Numbers, Bulk Call, Voice Broadcast, Contacts, Call Logs', type: 'text' },
          { label: 'Account & Billing', value: 'Prepaid Wallet, Razorpay Top-ups, API Keys, Settings', type: 'text' },
          { label: 'Active Currency', value: 'Indian Rupees (INR / Paise)', type: 'badge' }
        ]}
      />

      {/* Target Users & Use Cases */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Who Uses Spandan?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan is engineered for teams requiring automated voice interactions at scale:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Sales & Growth Teams:</strong> Automate outbound cold outreach, qualify inbound web leads immediately upon form submission, and book calendar appointments in real time.</li>
        <li><strong>Customer Support Operations:</strong> Handle tier-1 customer inquiries, answer common questions grounded strictly in product manuals, and route escalated issues to human agents.</li>
        <li><strong>Collections & Financial Services (BFSI):</strong> Automate payment reminders, EMI collection negotiation, and KYC verification calls in compliance with financial regulations.</li>
        <li><strong>Healthcare & Clinics:</strong> Confirm patient appointments, reschedule bookings, and deliver post-consultation prescription follow-ups.</li>
        <li><strong>Real Estate & Education:</strong> Qualify buyer criteria, schedule site visits, and conduct student onboarding surveys.</li>
      </ul>

      {/* Indian Telephony & Regulatory Compliance */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>4. Indian Telephony & TRAI / DLT Compliance</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Outbound commercial voice calling in India is strictly regulated by the Telecom Regulatory Authority of India (TRAI). Spandan incorporates first-class regulatory compliance tooling:
      </p>
      
      <DocsCallout type="important" title="TRAI / DLT COMPLIANCE MANDATE">
        In accordance with TRAI regulations, outbound commercial calls to Indian phone numbers (+91) require an approved Principal Entity (PE) registration, Telemarketer (TM) chain binding, and registered DLT voice header templates before carrier provisioning.
      </DocsCallout>

      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Principal Entity (PE ID):</strong> Registered 19-digit identifier issued by telecom operators (Airtel, Jio, Vodafone Idea, BSNL, Tata).</li>
        <li><strong>Telemarketer (TM ID) Binding:</strong> Cryptographic linking of your entity to the Spandan telecom infrastructure.</li>
        <li><strong>DLT Voice Templates:</strong> Pinned greeting templates registered on the carrier portal to guarantee outbound calling compliance.</li>
        <li><strong>Verified Caller IDs:</strong> Verify existing business landlines and mobile numbers via instant OTP ringback for outbound caller ID display.</li>
      </ul>

      {/* Commercial Model */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>5. Commercial & Billing Model</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan utilizes a clear, transparent prepaid wallet system denominated in <strong>Indian Rupees (INR)</strong>:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Single Talk-Time Rate:</strong> You only pay for actual connected conversation talk-time in whole billing increments. Unanswered, failed, or busy calls incur zero charges.</li>
        <li><strong>Instant Razorpay Top-ups:</strong> Refill your balance directly using UPI, Credit/Debit Cards, NetBanking, or Corporate Wallets with immediate receipt generation.</li>
        <li><strong>Append-Only Ledger:</strong> Every debit and credit is logged in a transparent `WalletTransaction` audit trail, complete with linked call log identifiers and duration breakdowns.</li>
        <li><strong>Automated Tax Invoices:</strong> Sequential GST-compliant tax invoices (INV-2026-XXXXXX) generated automatically for every payment.</li>
      </ul>

      <DocsCallout type="tip" title="NEXT STEP: GETTING STARTED">
        Follow our comprehensive <Link to="/docs/user/getting-started" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>Quick Start Guide</Link> to create your first agent and complete a live test call in under 5 minutes.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Documentation Home
        </Link>
        <Link to="/docs/user/getting-started" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Quick Start Guide →
        </Link>
      </div>
    </div>
  );
}
