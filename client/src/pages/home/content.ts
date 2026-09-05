/**
 * Every word and number on the landing page, in one place.
 *
 * Copy lives here rather than inline in the JSX because most of it is repeated
 * structure — use-case cards, capability cards, integration rows, FAQ entries —
 * and reading it as data makes it obvious when one entry has drifted from the
 * others. A copy change never risks touching the layout.
 *
 * The page's section order follows a conventional marketing flow: hero →
 * social proof → omnichannel → trust → get-started → use cases → QA/analytics →
 * capabilities → integrations → builder → FAQ → close.
 *
 * Numbers are the product's real figures (40+ languages, sub-500ms response,
 * thousands of calls per campaign, 30+ integrations). No price appears here or
 * anywhere public — this product bills a prepaid balance at one per-minute
 * rate quoted per account, so there is no tier to show (see Pricing.tsx).
 */

import { BRAND } from '@/lib/brand';

export type AccentKey = 'cyan' | 'violet' | 'lime' | 'coral';

export const ACCENT: Record<AccentKey, string> = {
  cyan: 'var(--cyan)',
  violet: 'var(--violet)',
  lime: 'var(--lime)',
  coral: 'var(--coral)',
};

/* ── Hero ──────────────────────────────────────────────────────────────── */

export const HERO = {
  eyebrow: 'CONVERSATIONAL AI · VOICE · WHATSAPP · WEB',
  title: 'Every customer conversation, handled by an agent that acts.',
  lede:
    'Spandan builds AI agents that hold real conversations across voice, WhatsApp, chat and the web — answering questions from your knowledge base, following your rules, and finishing the task before the call ends.',
  primary: { label: 'Start building', to: '/signup' },
  secondary: { label: 'Talk to sales', to: '/contact' },
};

/* ── "Try an agent" phone box (hero + support widget) ────────────────────
 * Frontend-only for now: submitting queues client-side and shows a pending
 * message rather than placing a real call. The outbound-call wiring
 * (rate limits, abuse controls, a fixed demo agent) is a separate task.
 */

export interface DialCountry {
  iso: string;
  dial: string;
  flag: string;
  name: string;
}

export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
  { iso: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
  { iso: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { iso: 'AE', dial: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { iso: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
  { iso: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
  { iso: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
];

export const TRY_AGENT = {
  eyebrow: 'HEAR IT FOR YOURSELF',
  placeholder: 'Phone number',
  button: 'Try an agent',
  pending: 'Queuing…',
  queuedBody: 'You’re on the list — live demo calls launch soon. We’ll text this number the moment they’re on.',
  errorInvalid: 'Enter a valid phone number.',
};

/* ── Floating support widget (bottom-right) ──────────────────────────── */

export const SUPPORT_WIDGET = {
  launcherOpenLabel: 'Open support',
  launcherCloseLabel: 'Close support',
  title: 'Spandan Support',
  subtitle: 'Spandan agents handle support around the clock — chat or request a callback.',
  chat: {
    label: 'Chat',
    placeholder: 'Type a message…',
    pendingNotice: `Live chat isn’t wired up yet. In the meantime, reach us at ${BRAND.supportEmail}.`,
  },
  call: { label: 'Call' },
  disclaimer: 'By continuing, you agree to our Privacy Policy and Terms.',
};

export interface Channel {
  icon: 'phone' | 'whatsapp' | 'chat' | 'globe';
  label: string;
  detail: string;
}

export const CHANNELS: Channel[] = [
  { icon: 'phone', label: 'Voice', detail: 'Inbound and outbound phone calls on your own numbers.' },
  { icon: 'whatsapp', label: 'WhatsApp', detail: 'Two-way WhatsApp Business conversations and templates.' },
  { icon: 'globe', label: 'Web', detail: 'A call widget or chat embed on any page of your site.' },
  { icon: 'chat', label: 'Chat', detail: 'The same agent inside your product’s support surface.' },
];

export const HERO_STATS = [
  { value: '40+', label: 'languages & voices' },
  { value: '<500ms', label: 'first response' },
  { value: '1000s', label: 'calls / campaign' },
  { value: '30+', label: 'integrations' },
];

/* A scripted snippet for the hero's call-console mock. Not interactive. */
export const CONSOLE = {
  title: 'Reception agent',
  status: 'on call · 00:42',
  turns: [
    { who: 'Caller', text: 'Hi, my water heater stopped working this morning.' },
    { who: 'Agent', text: 'Sorry to hear that. Are you an existing customer with us?' },
    { who: 'Caller', text: 'Yes — under Priya Nair.' },
    { who: 'Agent', text: 'Thanks Priya. You’re on the Home Care plan, so this is covered.' },
  ],
  tool: 'CRM · lookup_customer',
  outcome: 'Technician booked · 9–11 AM tomorrow',
};

/* ── Social proof — generic, unattributed ──────────────────────────────── */

export const PROOF = {
  heading: 'Built for teams that live on the phone',
  industries: [
    'Healthcare', 'Fintech', 'E-commerce', 'Insurance',
    'Real estate', 'Education', 'Logistics', 'Restaurants',
  ],
  /*
   * Outcome statements, not quotes. Each is drawn from this product's own
   * use-case and vertical material — no customer is named, and no individual
   * is attributed. The label is the segment the outcome belongs to.
   */
  outcomes: [
    {
      quote:
        'Reschedules, cancellations and reminders run themselves. The front desk stopped being a phone queue.',
      label: 'Healthcare deployments',
    },
    {
      quote:
        'Every overdue invoice gets the same calm call — and a payment plan set up on the spot when it’s needed.',
      label: 'Collections teams',
    },
    {
      quote:
        'Diners get an answer and a booking at 11pm, in their own language. No missed covers.',
      label: 'Restaurants & hospitality',
    },
  ],
};

/* ── Omnichannel ──────────────────────────────────────────────────────── */

export const OMNI = {
  kicker: 'ONE AGENT, EVERY CHANNEL',
  title: 'Build the agent once. Meet customers on every channel.',
  body:
    'Start on voice. Add WhatsApp when you’re ready. Drop the same agent into your app or website the week after. One knowledge base, one set of tools, one conversation history — nothing gets rebuilt per channel.',
};

/* ── Trust ────────────────────────────────────────────────────────────── */

export const TRUST = {
  kicker: 'TRUST, BY DEFAULT',
  title: 'Compliant by construction, not as an afterthought.',
  body:
    'Calls run in your region, on your carrier and your numbers. Recording is consent-gated, every action the agent takes is written to an audit log, and access is scoped per workspace.',
  points: [
    'In-region processing and storage',
    'Bring your own carrier and numbers',
    'Consent-gated call recording',
    'End-to-end audit trail on every call',
  ],
};

export const BADGES = ['SOC 2', 'HIPAA-aware', 'GDPR', 'PCI-ready', 'Call-recording consent'];

/* ── "Not sure yet?" — hand the question to an assistant ───────────────── */

const ASK_QUERY =
  'Is Spandan (spandan.ai) a good platform for building AI voice phone agents, and how does it compare to the alternatives?';

export const ASK_AI = {
  heading: 'Not sure yet? Ask an AI you already trust.',
  body: 'Have your assistant of choice weigh Spandan against the alternatives.',
  links: [
    { label: 'Ask ChatGPT', href: `https://chatgpt.com/?q=${encodeURIComponent(ASK_QUERY)}` },
    { label: 'Ask Claude', href: `https://claude.ai/new?q=${encodeURIComponent(ASK_QUERY)}` },
    { label: 'Ask Perplexity', href: `https://www.perplexity.ai/search?q=${encodeURIComponent(ASK_QUERY)}` },
  ],
};

/* ── Get-started band ─────────────────────────────────────────────────── */

export const CTA_BAND = {
  title: 'Get started today. Launch an agent this week.',
  primary: { label: 'Create your agent', to: '/signup' },
  secondary: { label: 'Book a 30-min demo', to: '/book-appointment' },
};

/* ── Use cases ────────────────────────────────────────────────────────── */

export type Bucket = 'activate' | 'retain' | 'support';

export const USE_CASE_BUCKETS: Array<{ key: Bucket; label: string; blurb: string }> = [
  { key: 'activate', label: 'Activate', blurb: 'Reach out, qualify, and book.' },
  { key: 'retain', label: 'Retain', blurb: 'Follow up, recover, and renew.' },
  { key: 'support', label: 'Support', blurb: 'Answer, resolve, and route.' },
];

export interface UseCase {
  bucket: Bucket;
  tag: string;
  title: string;
  body: string;
  to: string;
}

export const USE_CASES: UseCase[] = [
  {
    bucket: 'activate',
    tag: 'B2B & education',
    title: 'Lead qualification',
    body: 'Call every inbound lead within minutes, run discovery against your criteria, and pass on only the ones ready to buy.',
    to: '/solutions/use-cases/lead-generation',
  },
  {
    bucket: 'activate',
    tag: 'Healthcare & services',
    title: 'Appointment setting',
    body: 'Offer real slots, confirm, reschedule and remind — written straight to your calendar during the call.',
    to: '/solutions/use-cases/appointments',
  },
  {
    bucket: 'retain',
    tag: 'Lending & BFSI',
    title: 'Collections & reminders',
    body: 'Recover overdue payments with a calm, consistent agent that can set up a payment plan on the spot.',
    to: '/solutions/use-cases/collections',
  },
  {
    bucket: 'retain',
    tag: 'Sales',
    title: 'Renewals & negotiation',
    body: 'Hold a price, offer only the concessions you’ve approved, and close within your guardrails.',
    to: '/solutions/use-cases/negotiation',
  },
  {
    bucket: 'support',
    tag: 'E-commerce & SaaS',
    title: 'Customer support',
    body: 'Resolve the common issues end to end — order status, returns, refunds — and escalate the rest with full context.',
    to: '/solutions/use-cases/customer-support',
  },
  {
    bucket: 'support',
    tag: 'Every business',
    title: 'Receptionist',
    body: 'Answer every call, route by intent, and never send a caller to voicemail.',
    to: '/solutions/use-cases/customer-support',
  },
];

export const INDUSTRIES = [
  { label: 'E-commerce', to: '/solutions/verticals/ecommerce' },
  { label: 'Education', to: '/solutions/verticals/education' },
  { label: 'Finance', to: '/solutions/verticals/finance' },
  { label: 'Healthcare', to: '/solutions/verticals/healthcare' },
  { label: 'Insurance', to: '/solutions/verticals/insurance' },
  { label: 'Real Estate', to: '/solutions/verticals/real-estate' },
  { label: 'Restaurants', to: '/solutions/verticals/restaurants' },
];

/* ── QA & analytics ──────────────────────────────────────────────────── */

export const QA = {
  kicker: 'QA & ANALYTICS',
  title: 'A scorecard and an alert on every conversation.',
  body:
    'Every call is transcribed, scored against your success criteria, and checked for the failure modes that matter — off-script claims, talking over the caller, missed hand-offs. Problems surface as alerts, not as something you find a week later.',
  link: { label: 'See call analytics', to: '/analytics' },
  card: {
    title: 'Call · appointment booking',
    note: 'illustrative',
    metrics: [
      { label: 'Criteria met', value: '4 / 4' },
      { label: 'Answer relevance', value: '93%' },
      { label: 'Tool calls valid', value: '100%' },
      { label: 'Script adherence', value: '88%' },
    ],
    issues: [
      {
        tag: 'Off-script claim',
        severity: 'high' as const,
        text: 'Quoted a delivery window that isn’t in the knowledge base.',
      },
      {
        tag: 'Talk-over',
        severity: 'med' as const,
        text: 'Started speaking once before the caller had finished.',
      },
    ],
  },
};

/* ── Capabilities ────────────────────────────────────────────────────── */

export interface Capability {
  accent: AccentKey;
  stat: string;
  title: string;
  body: string;
}

export const CAPABILITIES: Capability[] = [
  {
    accent: 'cyan',
    stat: '40+ languages',
    title: 'Speaks your customer’s language',
    body: 'More than 40 voices and languages, switching mid-conversation when the caller does.',
  },
  {
    accent: 'coral',
    stat: '<500 ms',
    title: 'Answers before the pause gets awkward',
    body: 'Under half a second from the caller finishing their sentence to the agent starting to reply, across the whole turn.',
  },
  {
    accent: 'lime',
    stat: '1000s / campaign',
    title: 'Runs a campaign, not just a call',
    body: 'Thousands of outbound calls with pacing, retries and a recorded outcome for every one.',
  },
  {
    accent: 'violet',
    stat: 'One context',
    title: 'Remembers the whole relationship',
    body: 'A single memory across voice, WhatsApp and web, so the agent picks up where the last conversation left off.',
  },
];

/* ── Integrations ────────────────────────────────────────────────────── */

export interface Integration {
  name: string;
  detail: string;
}

export const INTEGRATIONS: Integration[] = [
  { name: 'HubSpot', detail: 'Log calls and sync new leads automatically.' },
  { name: 'Salesforce', detail: 'Read and update records mid-conversation.' },
  { name: 'Cal.com', detail: 'Book, reschedule and send reminders.' },
  { name: 'Google Calendar', detail: 'Create and move events during the call.' },
  { name: 'Calendly', detail: 'Offer real availability and confirm instantly.' },
  { name: 'Slack', detail: 'Post call outcomes to the right channel.' },
  { name: 'Zapier', detail: 'Pipe any outcome into thousands of apps.' },
  { name: 'Twilio', detail: 'Bring your own numbers and SIP trunks.' },
];

export const INTEGRATIONS_LINK = { label: 'Browse integrations', to: '/integrations' };

/* ── Builder canvas ─────────────────────────────────────────────────── */

export const BUILDER = {
  kicker: 'AGENT BUILDER',
  title: 'One canvas for the whole conversation.',
  body:
    'Look something up, make a decision, place a call, branch on how it went — build the flow visually and test it in the browser before it ever dials out.',
  link: { label: 'Open the builder', to: '/dashboard' },
};

export interface FlowNode {
  kind: 'trigger' | 'action' | 'branch' | 'end';
  label: string;
  meta?: string;
  accent?: AccentKey;
}

/* Rendered as a simple top-to-bottom flow with one branch. */
export const FLOW: FlowNode[] = [
  { kind: 'trigger', label: 'Call answered', accent: 'cyan' },
  { kind: 'action', label: 'Look up caller', meta: 'HubSpot', accent: 'lime' },
  { kind: 'branch', label: 'Known customer?', accent: 'violet' },
  { kind: 'action', label: 'Offer next slot', meta: 'Cal.com · yes', accent: 'lime' },
  { kind: 'action', label: 'Qualify & route', meta: 'no', accent: 'coral' },
  { kind: 'end', label: 'Write outcome', meta: 'CRM' },
];

/* ── FAQ ────────────────────────────────────────────────────────────── */

export interface Faq {
  q: string;
  a: string;
}

export const FAQ: Faq[] = [
  {
    q: 'What is a voice AI agent?',
    a: 'Software that has a spoken phone conversation on your behalf. It listens, works out what the caller means, decides what to do using your rules and knowledge base, and can take actions — booking, updating a record, taking a payment — before the call ends.',
  },
  {
    q: 'How is this different from an IVR or a phone tree?',
    a: 'There are no menus. The caller talks normally and can interrupt at any point, and the agent responds to what was actually said. It also completes the task itself rather than routing the caller to someone who will.',
  },
  {
    q: 'What can a Spandan agent do on a call?',
    a: 'Answer questions grounded in your documents, qualify and route leads, book and reschedule appointments, take and update orders, run collections and reminders, and hand off to a human with full context when it needs to.',
  },
  {
    q: 'Which languages are supported?',
    a: 'More than 40, across natural voices, with the agent able to switch language mid-call if the caller does.',
  },
  {
    q: 'How fast does it respond?',
    a: 'Typically under half a second from the caller finishing their sentence to the agent starting its reply.',
  },
  {
    q: 'Can I use my own phone numbers and carrier?',
    a: 'Yes. Spandan runs on your numbers over Twilio, SIP or supported carriers, and India numbers can carry verified caller identity so your brand shows on the dial.',
  },
  {
    q: 'Is it compliant?',
    a: 'Calls run in-region, recording is consent-gated, and every action is audit-logged. The platform is SOC 2, GDPR and PCI-ready, with HIPAA-aware handling for healthcare.',
  },
  {
    q: 'Are automated AI calls legal?',
    a: 'Automated calling is regulated — TRAI in India, TCPA and FCC rules in the US, GDPR in the EU. You are responsible for consent and calling windows; Spandan provides consent capture, do-not-call handling, recording disclosure and audit logs to help you operate within them.',
  },
  {
    q: 'How is it priced?',
    a: 'A single per-minute rate drawn from a prepaid balance — no tiers. The rate depends on your volume and use case, so it is worked out with our sales team rather than published.',
  },
  {
    q: 'How long does it take to launch?',
    a: 'An agent can be built and tested in the browser the same day. Going live on a phone number usually takes a few days, mostly number provisioning and verification.',
  },
];

/* ── Close ──────────────────────────────────────────────────────────── */

export const FINAL = {
  title: 'Give every conversation an agent that answers.',
  primary: { label: 'Start building', to: '/signup' },
  secondary: { label: 'Talk to sales', to: '/contact' },
};
