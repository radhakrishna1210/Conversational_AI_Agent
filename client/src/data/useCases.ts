import {
  Phone,
  CreditCard,
  Handshake,
  Headphones,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react';

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
}

export interface Benefit {
  metric: string;
  label: string;
  description: string;
}

export interface Feature {
  title: string;
  description: string;
}

export interface UseCase {
  slug: string;
  title: string;
  subtitle: string;
  heroHeading: string;
  heroDescription: string;
  icon: LucideIcon;
  gradient: string;        // CSS gradient string
  accentColor: string;     // single colour for glows / borders
  features: Feature[];
  workflowSteps: WorkflowStep[];
  benefits: Benefit[];
  ctaTitle: string;
  ctaDescription: string;
}

export const useCases: UseCase[] = [
  // ── Lead Generation ────────────────────────────────────────────────────
  {
    slug: 'lead-generation',
    title: 'Lead Generation',
    subtitle: 'Turn cold calls into warm opportunities — automatically.',
    heroHeading: 'Supercharge Your Sales Pipeline with AI Voice Agents',
    heroDescription:
      'Deploy intelligent voice agents that qualify leads 24/7, extract key intent signals, and hand off only sales-ready prospects to your team — at a fraction of the cost of human SDRs.',
    icon: Phone,
    gradient: 'linear-gradient(135deg, #0eb39e 0%, #0575e6 100%)',
    accentColor: '#0eb39e',
    features: [
      {
        title: 'Smart Lead Qualification',
        description:
          'AI dynamically scores leads during the call using BANT criteria, asking the right follow-up questions in natural conversation.',
      },
      {
        title: 'Instant CRM Sync',
        description:
          'Every qualified lead is automatically pushed to Salesforce, HubSpot, or your custom CRM with full call notes and scores.',
      },
      {
        title: 'Multi-language Outreach',
        description:
          'Reach global markets with voice agents fluent in 30+ languages, adapting tone and script to cultural context.',
      },
      {
        title: 'Real-time Objection Handling',
        description:
          'Pre-trained on thousands of sales conversations, the agent handles objections gracefully and keeps prospects engaged.',
      },
      {
        title: 'Automated Follow-ups',
        description:
          'Schedule callbacks, send follow-up SMS, or book demo slots automatically based on call outcomes.',
      },
      {
        title: 'Analytics & Conversion Insights',
        description:
          'Detailed dashboards reveal which scripts, times, and demographics convert best — continuously improving results.',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Import Your Lead List',
        description: 'Upload a CSV or connect your CRM. The agent ingests contact data and personalises every conversation.',
      },
      {
        step: 2,
        title: 'AI Places Outbound Call',
        description: 'The voice agent calls each lead at the optimal time, introduces itself naturally, and begins qualification.',
      },
      {
        step: 3,
        title: 'Qualify & Score',
        description: 'Structured BANT questions are woven into genuine dialogue, with real-time scoring happening behind the scenes.',
      },
      {
        step: 4,
        title: 'Handoff to Human',
        description: 'Hot leads are instantly transferred or scheduled with your sales rep, complete with a call summary.',
      },
      {
        step: 5,
        title: 'Sync & Iterate',
        description: 'All data flows into your CRM. Conversion analytics drive continuous prompt and script improvements.',
      },
    ],
    benefits: [
      { metric: '10×', label: 'More Calls Per Day', description: 'vs a single human SDR' },
      { metric: '68%', label: 'Lead Qualification Cost Reduction', description: 'compared to traditional methods' },
      { metric: '24/7', label: 'Always-On Outreach', description: 'never miss a lead, regardless of time zone' },
    ],
    ctaTitle: 'Start Generating Qualified Leads Today',
    ctaDescription:
      'Deploy your first AI lead-generation agent in minutes. No code required.',
  },

  // ── Collections ────────────────────────────────────────────────────────
  {
    slug: 'collections',
    title: 'Debt Collections',
    subtitle: 'Recover revenue faster while maintaining customer dignity.',
    heroHeading: 'Automate Collections with Empathetic AI Voice Agents',
    heroDescription:
      'Transform your collections process with AI agents that handle payment reminders, negotiate arrangements, and process payments — compliantly and at scale.',
    icon: CreditCard,
    gradient: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
    accentColor: '#f97316',
    features: [
      {
        title: 'Regulatory Compliance Built-In',
        description:
          'FDCPA, TCPA, and GDPR guardrails are embedded at the model level — every interaction stays within legal boundaries.',
      },
      {
        title: 'Dynamic Payment Plans',
        description:
          'Agents can offer, negotiate, and finalise instalment plans within your pre-approved rules, no human needed.',
      },
      {
        title: 'Omni-channel Follow-up',
        description:
          'Automatically switch to SMS or email when calls go unanswered, maintaining consistent contact cadence.',
      },
      {
        title: 'Sensitive Conversation Handling',
        description:
          'Trained on empathetic dialogue, the agent detects distress signals and escalates to a human agent when appropriate.',
      },
      {
        title: 'Secure Payment Processing',
        description:
          'PCI-DSS compliant payment capture directly on the call — no card data ever reaches your systems.',
      },
      {
        title: 'Portfolio Prioritisation',
        description:
          'ML-driven ranking surfaces the highest-recovery-probability accounts for immediate outreach.',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Upload Accounts Receivable',
        description: 'Connect your billing system or upload outstanding invoices directly.',
      },
      {
        step: 2,
        title: 'AI Contacts Debtor',
        description: 'Personalised, empathetic call at the compliant time window, referencing specific account details.',
      },
      {
        step: 3,
        title: 'Negotiate Arrangement',
        description: 'Agent offers payment options within your configured parameters, handling objections in real time.',
      },
      {
        step: 4,
        title: 'Process Payment',
        description: 'Secure IVR payment capture or direct bank redirect — PCI-DSS compliant throughout.',
      },
      {
        step: 5,
        title: 'Update & Report',
        description: 'Accounts are updated instantly; daily recovery reports are pushed to your finance dashboard.',
      },
    ],
    benefits: [
      { metric: '3×', label: 'Higher Recovery Rate', description: 'vs traditional collection calls' },
      { metric: '80%', label: 'Reduction in Agent Hours', description: 'freeing your team for complex cases' },
      { metric: '100%', label: 'Compliance Coverage', description: 'FDCPA & TCPA guardrails on every call' },
    ],
    ctaTitle: 'Recover More Revenue, Automatically',
    ctaDescription:
      'Get your AI collections agent live in under an hour. Compliance included.',
  },

  // ── Negotiation ────────────────────────────────────────────────────────
  {
    slug: 'negotiation',
    title: 'Negotiation',
    subtitle: 'Close deals and resolve disputes with AI-powered negotiation.',
    heroHeading: 'Intelligent AI Agents That Negotiate on Your Behalf',
    heroDescription:
      'Deploy voice agents trained in principled negotiation to handle pricing discussions, contract renewals, settlements, and vendor negotiations — at enterprise scale.',
    icon: Handshake,
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    accentColor: '#8b5cf6',
    features: [
      {
        title: 'Principled Negotiation Framework',
        description:
          'Agents use BATNA analysis and interest-based negotiation, never positional bargaining — achieving better outcomes for both parties.',
      },
      {
        title: 'Dynamic Concession Management',
        description:
          'Pre-configured concession ladders allow agents to make strategic offers within your approved parameters.',
      },
      {
        title: 'Sentiment & Tone Analysis',
        description:
          'Real-time emotional intelligence detects frustration or readiness to agree, adjusting strategy mid-call.',
      },
      {
        title: 'Settlement Authority Controls',
        description:
          'Hard limits on discounts, terms, and concessions ensure every deal stays within your business rules.',
      },
      {
        title: 'Full Conversation Recording',
        description:
          'Every negotiation is recorded, transcribed, and summarised for legal and compliance review.',
      },
      {
        title: 'Escalation Protocols',
        description:
          'Complex or high-value negotiations are automatically escalated to senior human negotiators with full context.',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Define Negotiation Parameters',
        description: 'Set your walk-away positions, acceptable ranges, and priority terms in the agent configuration.',
      },
      {
        step: 2,
        title: 'Agent Opens Negotiation',
        description: 'Natural conversation opener establishes rapport before the agent moves to the negotiation agenda.',
      },
      {
        step: 3,
        title: 'Explore Interests & Trade-offs',
        description: 'Principled questioning uncovers what matters most to the other party, enabling creative solutions.',
      },
      {
        step: 4,
        title: 'Propose & Counter',
        description: 'Structured offer-counter cycles within your concession ladder, tracked in real time.',
      },
      {
        step: 5,
        title: 'Close & Document',
        description: 'Agreed terms are read back, confirmed, recorded, and pushed to your contract management system.',
      },
    ],
    benefits: [
      { metric: '45%', label: 'Faster Deal Closure', description: 'AI never stalls, always moves forward' },
      { metric: '92%', label: 'Within-Policy Outcomes', description: 'every deal stays inside your guardrails' },
      { metric: '5×', label: 'Scale vs Human Negotiators', description: 'negotiate thousands of deals simultaneously' },
    ],
    ctaTitle: 'Put AI at the Negotiation Table',
    ctaDescription:
      'Your AI negotiator is ready to deploy. Configure parameters and go live today.',
  },

  // ── Customer Support ───────────────────────────────────────────────────
  {
    slug: 'customer-support',
    title: 'Customer Support',
    subtitle: 'Deliver instant, expert support at any volume, any hour.',
    heroHeading: 'AI Voice Agents That Resolve, Not Just Route',
    heroDescription:
      'Replace IVR frustration with truly conversational AI support that understands context, resolves issues end-to-end, and escalates intelligently — boosting CSAT while slashing costs.',
    icon: Headphones,
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    accentColor: '#06b6d4',
    features: [
      {
        title: 'Intent Understanding',
        description:
          'Beyond keywords — the agent grasps full context and multi-part requests, resolving the right issue first time.',
      },
      {
        title: 'Knowledge Base Integration',
        description:
          'Connects to your Confluence, Notion, or custom knowledge base, always citing accurate, up-to-date answers.',
      },
      {
        title: 'Live Account Lookup',
        description:
          'Authenticates callers and pulls live account data from your CRM or ERP during the call — no screen-sharing needed.',
      },
      {
        title: 'Ticket Auto-creation',
        description:
          'Unresolved issues are logged as fully-described tickets in Zendesk, Freshdesk, or your system of record.',
      },
      {
        title: 'Warm Transfer to Human',
        description:
          'When escalation is needed, the agent briefs the human agent with a full summary before the handoff.',
      },
      {
        title: 'Post-call CSAT Survey',
        description:
          'Automated satisfaction survey at end of each call, with scores fed into your analytics dashboard in real time.',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Customer Calls In',
        description: 'AI agent answers instantly — zero hold time, any hour of the day.',
      },
      {
        step: 2,
        title: 'Authenticate & Understand',
        description: 'Caller is verified via voice or PIN, and the agent identifies their intent through natural conversation.',
      },
      {
        step: 3,
        title: 'Retrieve & Resolve',
        description: 'Agent queries knowledge base and live systems, resolving the issue or providing accurate information.',
      },
      {
        step: 4,
        title: 'Escalate if Needed',
        description: 'Complex cases are transferred with a full context summary — no repeat explanation for the customer.',
      },
      {
        step: 5,
        title: 'Log & Learn',
        description: 'All interactions are analysed to surface knowledge gaps, training the agent continuously.',
      },
    ],
    benefits: [
      { metric: '< 1s', label: 'Answer Time', description: 'zero hold queues, ever' },
      { metric: '78%', label: 'First-call Resolution Rate', description: 'above industry average' },
      { metric: '60%', label: 'Support Cost Reduction', description: 'with no drop in CSAT' },
    ],
    ctaTitle: 'Redefine Your Customer Experience',
    ctaDescription:
      'Deploy a support agent that makes customers feel heard, helped, and valued.',
  },

  // ── Appointments ───────────────────────────────────────────────────────
  {
    slug: 'appointments',
    title: 'Appointment Scheduling',
    subtitle: 'Eliminate no-shows and scheduling friction with AI.',
    heroHeading: 'Your Always-Available AI Scheduling Assistant',
    heroDescription:
      'Let AI handle inbound and outbound appointment booking, reminders, rescheduling, and confirmations — fully integrated with your calendar and practice management system.',
    icon: CalendarCheck,
    gradient: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)',
    accentColor: '#10b981',
    features: [
      {
        title: 'Real-time Calendar Integration',
        description:
          'Reads live availability from Google Calendar, Outlook, Cal.com, or your EHR — books only valid slots.',
      },
      {
        title: 'Inbound & Outbound Booking',
        description:
          'Handles both incoming booking requests and proactive outreach to fill cancellation slots automatically.',
      },
      {
        title: 'Smart Reminder Cadence',
        description:
          'Multi-step reminder calls and SMS reduce no-show rates by up to 70%, triggered at optimal intervals.',
      },
      {
        title: 'Rescheduling & Cancellation',
        description:
          'Customers reschedule or cancel via voice or SMS, with instant calendar update and waitlist backfill.',
      },
      {
        title: 'Multi-location Support',
        description:
          'Route appointments to the right practitioner or location based on specialty, proximity, or preference.',
      },
      {
        title: 'Intake & Pre-screening',
        description:
          'Collect reason for visit, insurance details, or pre-appointment questionnaire responses during booking.',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Patient / Customer Calls',
        description: 'AI agent answers, identifies the caller, and asks what they need to book.',
      },
      {
        step: 2,
        title: 'Check Availability',
        description: 'Live calendar query returns available slots, presented conversationally.',
      },
      {
        step: 3,
        title: 'Confirm Details',
        description: 'Collects required intake information, confirms slot, and adds to calendar with notes.',
      },
      {
        step: 4,
        title: 'Send Confirmation',
        description: 'Confirmation SMS/email dispatched immediately; reminder cadence scheduled automatically.',
      },
      {
        step: 5,
        title: 'Manage Changes',
        description: 'Any reschedule or cancellation is handled via voice or SMS with instant calendar sync.',
      },
    ],
    benefits: [
      { metric: '70%', label: 'No-show Reduction', description: 'through AI-driven reminder cadence' },
      { metric: '24/7', label: 'Booking Availability', description: 'capture appointments even at 3 AM' },
      { metric: '5 min', label: 'Average Booking Time', description: 'vs 15+ min with traditional phone booking' },
    ],
    ctaTitle: 'Fill Your Calendar on Autopilot',
    ctaDescription:
      'Connect your calendar, configure your agent, and start taking bookings in minutes.',
  },
];

/** Quick lookup by slug */
export function getUseCaseBySlug(slug: string): UseCase | undefined {
  return useCases.find((uc) => uc.slug === slug);
}
