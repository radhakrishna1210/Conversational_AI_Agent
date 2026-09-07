import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Cpu, Volume2, Mic, Activity, Zap, PlayCircle } from 'lucide-react';

export default function UserVoiceAssistants() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Voice AI Setup</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Voice AI Assistants</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Understand the architecture, conversational engines, audio processing pipelines, and management controls powering Spandan Voice AI operators.
      </p>

      {/* Architecture Explanation */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Conversational Voice Engine Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan supports two state-of-the-art voice processing architectures depending on your latency, customization, and multi-language requirements:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--teal)', fontWeight: 700, marginBottom: '10px' }}>
            <Cpu size={18} />
            <span>Modular Pipeline (Recommended)</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
            A decoupled, ultra-optimized pipeline that connects discrete best-in-class components:
          </p>
          <ul style={{ fontSize: '12.5px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Speech-to-Text (STT):</strong> Azure Speech Services or Deepgram Nova-2 with real-time VAD.</li>
            <li><strong>Reasoning LLM:</strong> Gemini 2.5 Flash, OpenAI GPT-4.1 Mini, or Azure OpenAI.</li>
            <li><strong>Text-to-Speech (TTS):</strong> Natural neural voices from Google, ElevenLabs, or Cartesia.</li>
            <li><strong>RAG Context:</strong> Embedded document grounding via pgvector retrieval.</li>
          </ul>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--violet)', fontWeight: 700, marginBottom: '10px' }}>
            <Zap size={18} />
            <span>Speech-to-Speech (End-to-End)</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
            Unified real-time multimodal models where audio flows directly into the model without intermediate transcription text:
          </p>
          <ul style={{ fontSize: '12.5px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>xAI Grok Voice:</strong> Real-time conversational audio with ultra-expressive inflections.</li>
            <li><strong>ElevenLabs Conversational:</strong> High-fidelity character voices and instant speech synthesis.</li>
            <li><strong>Ultra-Low Latency:</strong> Sub-400ms turn-taking response speeds.</li>
          </ul>
        </div>
      </div>

      {/* Voice Call Processing Pipeline */}
      <DocsWorkflow
        title="Real-Time Audio & Speech Pipeline"
        description="How a customer's spoken voice travels through the Spandan real-time audio bridge and produces an instant spoken reply."
        steps={[
          {
            badge: '01. CARRIER AUDIO',
            title: 'Inbound Audio Stream',
            description: 'Customer speaks on mobile/landline; audio packets arrive over WebSockets/PSTN.',
            icon: <Volume2 size={16} />
          },
          {
            badge: '02. VAD & SPEECHGATE',
            title: 'Voice Activity Detection',
            description: 'VAD detects speech boundaries and instantly interrupts ongoing agent audio if user speaks.',
            icon: <Activity size={16} />
          },
          {
            badge: '03. STT & RAG',
            title: 'Transcription & Knowledge',
            description: 'Azure/Deepgram transcribes audio; RAG retrieves relevant document chunks from PostgreSQL.',
            icon: <Mic size={16} />
          },
          {
            badge: '04. LLM INFERENCE',
            title: 'Model Generation',
            description: 'LLM generates streaming token responses guided by system instructions and guardrails.',
            icon: <Cpu size={16} />
          },
          {
            badge: '05. TTS STREAMING',
            title: 'Speech Synthesis',
            description: 'Neural TTS streams audio chunks back through the telephony pacer to the caller.',
            icon: <PlayCircle size={16} />
          }
        ]}
      />

      {/* Dashboard Management */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>2. Managing Assistants in the Dashboard</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>Voice AI Assistants</strong> page (<code style={{ color: 'var(--teal-fg)' }}>/dashboard</code>) serves as your primary operator command center.
      </p>

      <DocsImage
        src="/screenshots/voice-ai-overview.png"
        alt="Voice AI Assistants Management Hub"
        caption="Voice AI Assistants management console: inspect agents, models, voice profiles, and active statuses"
      />

      <DocsScreenshotPlaceholder
        title="Voice AI Assistants Workspace Hub"
        description="All configured assistants are presented as interactive cards displaying model metadata, voice identity, configured languages, and direct action triggers."
        routePath="/dashboard"
        elements={[
          { label: 'Search Filter', value: 'Instant search by assistant name or model', type: 'input' },
          { label: 'Assistant Card', value: 'Name, AI Model, Voice Profile, Language, Duration Limit', type: 'text' },
          { label: 'Edit & Configure', value: 'Opens full 7-tab workbench', type: 'button' },
          { label: 'Delete Assistant', value: 'Permanently deletes agent and associated logs', type: 'button' }
        ]}
      />

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Assistant Card Elements</h3>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li><strong>Assistant Name:</strong> Clear label identifying the role (e.g., <em>"Mortgage Lead Qualifier"</em>).</li>
        <li><strong>AI Model Badge:</strong> The active intelligence engine (e.g., <code>Gemini-2.5-Flash</code>, <code>GPT-4.1-Mini</code>).</li>
        <li><strong>Voice Profile:</strong> Gender, accent, and provider (e.g., <em>Google - Aoede (female)</em>).</li>
        <li><strong>Call Parameters:</strong> Configured maximum call duration (default 30 mins) and silence timeout threshold.</li>
        <li><strong>DLT Header Status:</strong> Indicates whether a TRAI-approved telecom header template is linked for Indian outbound calls.</li>
      </ul>

      {/* Deletion & Safety Rules */}
      <DocsCallout type="warning" title="AGENT DELETION IMPACT">
        Deleting an assistant permanently removes its configuration, attached knowledge base links, test conversation logs, and recorded audio files from the database. This action cannot be undone.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/getting-started" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Quick Start Guide
        </Link>
        <Link to="/docs/user/agents" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Creating AI Voice Agents →
        </Link>
      </div>
    </div>
  );
}
