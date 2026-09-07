import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { UserCheck, Bot, Mic, Phone, CreditCard } from 'lucide-react';

export default function UserGettingStarted() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Getting Started</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Quick Start Guide</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Step-by-step instructions to create your account, configure your first Voice AI agent, test in the browser, and launch your first outbound telephone call.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="5-Minute Onboarding Workflow"
        description="The fastest path from account creation to a live, speaking Voice AI agent on the telephone network."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Create Account',
            description: 'Register your workspace and set up credentials.',
            icon: <UserCheck size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Top Up Wallet',
            description: 'Add initial balance (INR) via Razorpay checkout.',
            icon: <CreditCard size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Build Agent',
            description: 'Create an assistant from a template or custom prompt.',
            icon: <Bot size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Test in Browser',
            description: 'Perform real-time WebRTC voice testing directly in the dashboard.',
            icon: <Mic size={16} />
          },
          {
            badge: 'STEP 05',
            title: 'Dial Phone Call',
            description: 'Initiate a live carrier test call to your mobile device.',
            icon: <Phone size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>Step 1: Create & Access Your Workspace</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        To begin using Spandan, create an authenticated workspace account:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>Navigate to the <Link to="/signup" style={{ color: 'var(--teal-fg)', fontWeight: 600 }}>Sign Up</Link> page.</li>
        <li>Enter your full name, work email address, and a secure password (minimum 8 characters with uppercase, lowercase, and a number).</li>
        <li>Select <strong>Create Account</strong> or authenticate instantly using <strong>Google OAuth</strong>.</li>
        <li>Upon successful registration, you are automatically assigned a dedicated, isolated workspace.</li>
      </ol>

      <DocsImage
        src="/screenshots/Login_page.png"
        alt="Spandan Workspace Authentication Screen"
        caption="Sign in to your Spandan workspace or register a new account"
      />

      <DocsScreenshotPlaceholder
        title="Workspace Dashboard Landing"
        description="The primary home view listing active Voice AI Assistants, recent test sessions, quick use-case templates, and workspace wallet status."
        routePath="/dashboard"
        elements={[
          { label: 'Prompt Composer', value: 'Describe your agent and click Enhance Prompt or Create', type: 'input' },
          { label: 'Use Case Templates', value: 'Lead Generation, Appointments, Support, Collections', type: 'badge' },
          { label: 'Active Assistants Grid', value: 'Live status, AI model, voice profile, and actions', type: 'text' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>Step 2: Top Up Your Workspace Wallet</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        All outbound telephony calls and speech generation consume from your workspace prepaid wallet in <strong>Indian Rupees (INR)</strong>:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>From the left sidebar, navigate to <strong>Billing</strong> (<code style={{ color: 'var(--teal-fg)' }}>/billing</code>).</li>
        <li>Click <strong>Top Up Balance</strong> to open the payment modal.</li>
        <li>Select a preset amount (e.g., ₹500, ₹1,000, ₹2,500) or enter a custom amount (minimum ₹100).</li>
        <li>Click <strong>Pay with Razorpay</strong> and complete the transaction using UPI (Google Pay, PhonePe, Paytm), NetBanking, or Credit Card.</li>
        <li>The balance updates immediately, and a formal tax invoice is minted under <strong>Billing History</strong>.</li>
      </ol>

      <DocsCallout type="note" title="BILLING RUNWAY">
        The billing dashboard displays an estimated <strong>Runway Meter</strong> indicating how many talk-time minutes your current balance provides at the platform rate.
      </DocsCallout>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>Step 3: Create Your First Voice AI Agent</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan offers two fast methods to construct an agent on the Dashboard:
      </p>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Method A: Use an Industry Template</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        On the Dashboard (<code style={{ color: 'var(--teal-fg)' }}>/dashboard</code>), click any pre-configured template card:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li><strong>Lead Generation:</strong> Qualifies prospects on budget, urgency, and decision-maker status.</li>
        <li><strong>Appointments:</strong> Checks availability and books confirmed consultation slots.</li>
        <li><strong>Support:</strong> Resolves common queries and provides structured troubleshooting.</li>
        <li><strong>Collections:</strong> Handles polite, compliant payment reminders and settlement dates.</li>
      </ul>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Method B: Use the AI Prompt Composer</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>In the prompt box, type a natural description, e.g., <em>"Create an appointment booking assistant for a dental clinic in Mumbai."</em></li>
        <li>Click <strong>Enhance Prompt</strong>. The built-in LLM refines your instruction into a structured prompt with persona rules and fallback policies.</li>
        <li>Click <strong>Create Assistant</strong>. The assistant is generated and opened in the <strong>Edit Agent</strong> workbench.</li>
      </ol>

      <DocsImage
        src="/screenshots/voice-ai-overview.png"
        alt="Voice AI Assistants Dashboard"
        caption="Assistants overview: inspect model, voice profile, language, and deployment status"
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>Step 4: Test in Real-Time (Web Call & Chat)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Before dialing real phone numbers, test your assistant's latency, speech accuracy, and logic right inside the browser:
      </p>

      <DocsScreenshotPlaceholder
        title="Edit Agent Test Benches"
        description="The top toolbar provides three instant testing modes: Chat Test, Web Call (WebRTC audio), and Phone Call."
        routePath="/agent/:agentId"
        elements={[
          { label: 'Chat Test', value: 'Interactive text testing for prompt refinement', type: 'button' },
          { label: 'Web Call', value: 'Browser WebRTC voice call with microphone', type: 'button' },
          { label: 'Phone Call', value: 'Carrier test call to your mobile number', type: 'button' },
          { label: 'Deploy Status', value: 'Save Draft or Deploy to Production', type: 'button' }
        ]}
      />

      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>Click <strong>Web call</strong> in the top testing toolbar.</li>
        <li>Grant your browser microphone permission when prompted.</li>
        <li>Speak naturally. The assistant greets you with its configured opening and responds with live audio.</li>
        <li>Click <strong>End Call</strong>. The complete audio recording and synchronized transcript immediately appear under <strong>Recent Calls</strong>.</li>
      </ol>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>Step 5: Initiate a Live Phone Test Call</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Experience the exact latency and voice quality a customer hears on the telecom network:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>In the top toolbar, click <strong>Phone call</strong>.</li>
        <li>Enter your mobile number in international format (e.g., <code style={{ color: 'var(--teal-fg)' }}>+919876543210</code>).</li>
        <li>Select a verified caller ID or platform number.</li>
        <li>Click <strong>Call Now</strong>.</li>
        <li>Your phone will ring within 2-4 seconds. Answer the call and converse with the agent.</li>
      </ol>

      <DocsCallout type="tip" title="WHAT'S NEXT?">
        Now that your agent is verified, learn how to upload your company documents in the <Link to="/docs/user/knowledge-base" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>Knowledge Base Guide</Link> or launch multi-contact campaigns in the <Link to="/docs/user/bulk-campaigns" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>Bulk Campaigns Guide</Link>.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/overview" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Platform Overview
        </Link>
        <Link to="/docs/user/voice-assistants" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Voice AI Assistants →
        </Link>
      </div>
    </div>
  );
}
