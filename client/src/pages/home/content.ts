import type { VoiceStateId } from '@/lib/voiceStates';

/**
 * Every word and number on the landing page, in one place.
 *
 * Copy lives here rather than inline in the JSX because most of it is
 * repeated structure — six narrative steps, six stack layers, five scenarios —
 * and reading it as data makes it obvious when one entry has drifted from the
 * others. It also means a copy change never risks touching the layout.
 *
 * The design calls the sixth conversation state `action`; the product calls it
 * `acting` (see lib/voiceStates.ts, which every other surface reads). This file
 * uses the product's name so there is one vocabulary, not two.
 */

/* ── Hero ──────────────────────────────────────────────────────────────── */

export const HERO_STATS = [
  { value: '30+', label: 'integrations' },
  { value: '1000s', label: 'calls / campaign' },
  { value: '40+', label: 'languages & voices' },
];

export const CONNECTORS = [
  'Twilio', 'Salesforce', 'HubSpot', 'Google Calendar', 'Cal.com', 'Calendly',
  'Slack', 'Zapier', 'Make', 'Genesys', 'GoHighLevel', 'WhatsApp',
];

/* ── "Hear it live" — the replayed conversations ───────────────────────── */

export interface Turn {
  who: 'caller' | 'agent';
  s: VoiceStateId;
  /** First-token latency in ms. 0 for caller turns — they aren't generated. */
  lat: number;
  text: string;
  tool?: string;
}

export interface Scenario {
  label: string;
  title: string;
  turns: Turn[];
}

export const SCENARIOS: Record<string, Scenario> = {
  reception: {
    label: 'Receptionist',
    title: 'Receptionist · inbound',
    turns: [
      { who: 'caller', s: 'listening',     lat: 0,   text: "Hi, I'm calling about a water heater that stopped working." },
      { who: 'agent',  s: 'understanding', lat: 298, text: 'Sorry to hear that. Are you an existing customer with us?' },
      { who: 'caller', s: 'listening',     lat: 0,   text: 'Yeah — under Priya Nair.' },
      { who: 'agent',  s: 'thinking',      lat: 264, text: 'Thanks Priya, pulling up your account now.', tool: 'CRM · lookup_customer' },
      { who: 'agent',  s: 'speaking',      lat: 301, text: "You're on the Home Care plan, so this is covered. I can send a technician tomorrow, 9–11 AM." },
      { who: 'caller', s: 'listening',     lat: 0,   text: "Morning's perfect." },
      { who: 'agent',  s: 'acting',        lat: 288, text: "Booked for 9–11 AM. I've texted a confirmation to this number.", tool: 'Cal.com · create_booking' },
    ],
  },
  lead: {
    label: 'Lead qualification',
    title: 'Lead qual · outbound',
    turns: [
      { who: 'agent',  s: 'speaking',      lat: 0,   text: 'Hi, this is Spandan calling from Northwind — you asked about our warehouse plan. Two quick questions?' },
      { who: 'caller', s: 'listening',     lat: 0,   text: 'Sure, but keep it short.' },
      { who: 'agent',  s: 'understanding', lat: 276, text: 'Of course. Roughly how many orders do you ship a week?' },
      { who: 'caller', s: 'listening',     lat: 0,   text: 'Around fifteen hundred.' },
      { who: 'agent',  s: 'thinking',      lat: 255, text: "Great — that's a strong fit. Logging you as qualified.", tool: 'HubSpot · update_deal_stage' },
      { who: 'agent',  s: 'acting',        lat: 294, text: "I've booked you with an account exec for Thursday at 2. Calendar invite is on its way.", tool: 'Google Calendar · create_event' },
    ],
  },
  appt: {
    label: 'Appointment',
    title: 'Appointment · inbound',
    turns: [
      { who: 'caller', s: 'listening',     lat: 0,   text: 'I need to reschedule my Friday cleaning.' },
      { who: 'agent',  s: 'understanding', lat: 281, text: 'No problem. Let me find your booking.', tool: 'Cal.com · find_booking' },
      { who: 'agent',  s: 'speaking',      lat: 269, text: 'I see Friday at 3 PM. Same time next week, or would earlier suit you better?' },
      { who: 'caller', s: 'listening',     lat: 0,   text: 'Actually — can you do Monday morning?' },
      { who: 'agent',  s: 'thinking',      lat: 247, text: "Checking Monday's availability…" },
      { who: 'agent',  s: 'acting',        lat: 290, text: "Done — moved to Monday 9:30 AM. You'll get a reminder the night before.", tool: 'Cal.com · reschedule' },
    ],
  },
  support: {
    label: 'Support',
    title: 'Customer support · inbound',
    turns: [
      { who: 'caller', s: 'listening',     lat: 0,   text: 'My tracking says delivered but I never got the package.' },
      { who: 'agent',  s: 'understanding', lat: 272, text: "I'm sorry about that. Can you confirm the order number or the email on file?" },
      { who: 'caller', s: 'listening',     lat: 0,   text: "It's order 4-4-8-1-2." },
      { who: 'agent',  s: 'thinking',      lat: 259, text: "Found it. Checking the carrier's proof of delivery…", tool: 'Shopify · get_order' },
      { who: 'agent',  s: 'speaking',      lat: 284, text: "There's no signature on record, so I'll open a replacement right away." },
      { who: 'agent',  s: 'acting',        lat: 296, text: 'A replacement is on its way with priority shipping, no charge. Ticket #7781 created.', tool: 'Zendesk · create_ticket' },
    ],
  },
  collections: {
    label: 'Collections',
    title: 'Collections · outbound',
    turns: [
      { who: 'agent',  s: 'speaking',      lat: 0,   text: "Hi, this is a courtesy call from Meridian regarding an invoice that's 12 days past due." },
      { who: 'caller', s: 'listening',     lat: 0,   text: 'Oh — I thought that went through already.' },
      { who: 'agent',  s: 'understanding', lat: 268, text: 'It looks like the card on file was declined. It happens. Want to try it again now?' },
      { who: 'caller', s: 'listening',     lat: 0,   text: 'Can I split it into two payments?' },
      { who: 'agent',  s: 'thinking',      lat: 251, text: "Let me check what plans you're eligible for…", tool: 'Stripe · list_payment_plans' },
      { who: 'agent',  s: 'acting',        lat: 293, text: "Set up: half today, half on the 30th. I've emailed the receipt and schedule.", tool: 'Stripe · create_payment_plan' },
    ],
  },
};

/* ── "Anatomy of one call" — the scroll narrative ──────────────────────── */

export interface NarrativeStep {
  num: string;
  kicker: string;
  title: string;
  body: string;
  state: VoiceStateId;
}

export const NARRATIVE: NarrativeStep[] = [
  { num: '01', kicker: 'INCOMING',  state: 'idle',          title: 'The call arrives',              body: 'A call lands on a Spandan number — inbound, or one of thousands placed by a campaign. The agent picks up in under a second, with full context on who is calling.' },
  { num: '02', kicker: 'LISTENING', state: 'listening',     title: 'It listens for meaning',        body: 'Streaming speech becomes intent in real time. Not a transcript waiting for a pause — the agent tracks meaning as the caller speaks, and lets them interrupt at any moment.' },
  { num: '03', kicker: 'THINKING',  state: 'thinking',      title: 'It reasons over your context',  body: 'Your knowledge base, business rules and the live account all connect. The agent decides what is true, what to say, and which tool to reach for next.' },
  { num: '04', kicker: 'SPEAKING',  state: 'speaking',      title: 'It answers, naturally',         body: 'A human-like voice responds with the right pacing and warmth. Barge-in is always on — cut in mid-sentence and it stops, listens, and adjusts.' },
  { num: '05', kicker: 'ACTING',    state: 'acting',        title: 'It gets things done',           body: 'Mid-call, it books the meeting, updates the CRM, takes the payment or hits your API — the outcome happens inside the conversation, not after it.' },
  { num: '06', kicker: 'LEARNING',  state: 'understanding', title: 'It closes the loop',            body: 'Recording, transcript, structured summary and outcome flow into analytics the moment the call ends — so the next call is smarter than the last.' },
];

/* ── "The full stack" — the layer stepper ──────────────────────────────── */

export interface StackLayer {
  num: string;
  kicker: string;
  title: string;
  body: string;
  detail: string;
  state: VoiceStateId;
  color: string;
}

export const STACK: StackLayer[] = [
  { num: '01', kicker: 'CARRIER LAYER', title: 'Telephony & numbers',  state: 'idle',          color: 'var(--cyan)',   body: 'Provision numbers and route calls.',        detail: 'Real inbound and outbound calls over Twilio, SIP and your own numbers — with Airtel Verified Calling so your brand shows on every dial.' },
  { num: '02', kicker: 'PERCEPTION',    title: 'Speech recognition',   state: 'listening',     color: 'var(--cyan)',   body: 'Streaming speech to intent.',               detail: 'Audio becomes meaning as the caller speaks — not a transcript waiting for a pause. Barge-in is always on, so callers can interrupt naturally.' },
  { num: '03', kicker: 'REASONING',     title: 'The reasoning core',   state: 'thinking',      color: 'var(--violet)', body: 'Decide what is true and what to say.',      detail: 'Your chosen model reasons over business rules and live context to pick the next thing to say and the next tool to reach for — inside 500 ms.' },
  { num: '04', kicker: 'GROUNDING',     title: 'Knowledge & tools',    state: 'acting',        color: 'var(--lime)',   body: 'Ground answers, fire real actions.',        detail: 'The agent grounds every answer in your knowledge base and fires real tools mid-call — CRM, calendar, payments or any API — so the outcome happens inside the conversation.' },
  { num: '05', kicker: 'EXPRESSION',    title: 'Voice synthesis',      state: 'speaking',      color: 'var(--coral)',  body: 'Answer in a human-like voice.',             detail: 'Responses come back with the right pacing and warmth across 40+ voices and languages — with a generative fingerprint you tune in the Voice Lab.' },
  { num: '06', kicker: 'FEEDBACK LOOP', title: 'Analytics & learning', state: 'understanding', color: 'var(--cyan)',   body: 'Close the loop after every call.',          detail: 'Recording, transcript, structured summary and outcome flow into analytics the moment the call ends — so the next call is smarter than the last.' },
];

/* ── Solutions ─────────────────────────────────────────────────────────── */

export const USE_CASES = [
  { tag: '01 · OUTBOUND',   title: 'Lead generation',    body: 'Qualify inbound and outbound leads, score them against your rules, and hand off warm.',   to: '/solutions/use-cases/lead-generation' },
  { tag: '02 · SCHEDULING', title: 'Appointment setting', body: 'Book, confirm, reschedule and remind — synced straight to your calendar.',               to: '/solutions/use-cases/appointments' },
  { tag: '03 · INBOUND',    title: 'Customer support',    body: 'Resolve common issues end to end, escalate the rest with full context.',                 to: '/solutions/use-cases/customer-support' },
  { tag: '04 · OUTBOUND',   title: 'Collections',         body: 'Recover overdue payments with a calm, compliant, payment-plan-ready agent.',             to: '/solutions/use-cases/collections' },
  { tag: '05 · SALES',      title: 'Negotiation',         body: 'Hold a price, offer approved concessions, and close within guardrails.',                 to: '/solutions/use-cases/negotiation' },
  { tag: 'NEW · P0',        title: 'Receptionist',        body: 'Answer every call, route intelligently, and never send a caller to voicemail.',          to: '/solutions/use-cases/customer-support' },
];

export const INDUSTRIES = [
  { label: 'E-commerce',  to: '/solutions/verticals/ecommerce' },
  { label: 'Education',   to: '/solutions/verticals/education' },
  { label: 'Finance',     to: '/solutions/verticals/finance' },
  { label: 'Healthcare',  to: '/solutions/verticals/healthcare' },
  { label: 'Insurance',   to: '/solutions/verticals/insurance' },
  { label: 'Real Estate', to: '/solutions/verticals/real-estate' },
  { label: 'Restaurants', to: '/solutions/verticals/restaurants' },
];

/* ── The platform ──────────────────────────────────────────────────────── */

export const FEATURES = [
  { mark: 'AB', title: 'Agent Builder',    body: 'Persona, prompts, flows and behaviour in one conversation studio.', to: '/dashboard' },
  { mark: 'WC', title: 'Web Call Testing', body: 'Talk to your agent in the browser before it ever touches a phone.', to: '/voice_assistant' },
  { mark: 'OB', title: 'Outbound Calls',   body: 'Place real calls over Twilio and your own numbers.',                to: '/phone_numbers' },
  { mark: 'BC', title: 'Bulk Campaigns',   body: 'Thousands of calls with pacing, retries and outcomes.',             to: '/bulk_call' },
  { mark: 'KB', title: 'Knowledge Base',   body: 'Upload docs; the agent grounds every answer in them.',              to: '/files' },
  { mark: 'VC', title: 'Voice Cloning',    body: 'Clone or select from 40+ voices and accents.',                      to: '/clone_voice' },
  { mark: 'AN', title: 'Call Analytics',   body: 'Outcomes, latency, intents and failure reasons.',                   to: '/analytics' },
  { mark: 'WA', title: 'WhatsApp',         body: 'Extend the same agent to WhatsApp Business automation.',            to: '/whatsapp' },
];

/* ── Why Spandan ───────────────────────────────────────────────────────── */

export type Support = 'yes' | 'partial' | 'no';

export const COMPARE: Array<{ label: string; us: Support; bot: Support; ivr: Support }> = [
  { label: 'Natural barge-in (talk over the agent)',            us: 'yes', bot: 'no',      ivr: 'no' },
  { label: 'Sub-second first response',                          us: 'yes', bot: 'partial', ivr: 'no' },
  { label: 'Fires real tools mid-call (CRM, calendar, payments)', us: 'yes', bot: 'partial', ivr: 'no' },
  { label: 'Grounded in your knowledge base',                    us: 'yes', bot: 'partial', ivr: 'no' },
  { label: 'Outbound campaigns at scale',                        us: 'yes', bot: 'no',      ivr: 'partial' },
  { label: 'Structured outcome + transcript per call',           us: 'yes', bot: 'partial', ivr: 'no' },
];

/* ── Industry tabs ─────────────────────────────────────────────────────── */

export interface Vertical {
  name: string;
  short: string;
  accent: string;
  kicker: string;
  title: string;
  body: string;
  metrics: Array<{ value: string; label: string }>;
  to: string;
}

export const VERTICALS: Record<string, Vertical> = {
  healthcare: {
    name: 'Healthcare', short: 'Cut no-shows, free up the front desk', accent: 'var(--cyan-fg)', kicker: 'HEALTHCARE',
    title: 'Reduce appointment no-shows with real-time reminders',
    body: 'Confirm, reschedule or cancel appointments automatically — keeping calendars full and staff off the phone. HIPAA-aware, in-region, and always on.',
    metrics: [{ value: '-38%', label: 'no-show rate' }, { value: '24/7', label: 'coverage' }],
    to: '/solutions/verticals/healthcare',
  },
  finance: {
    name: 'Finance', short: 'Secure, compliant, built for scale', accent: 'var(--violet)', kicker: 'FINANCE',
    title: 'Resolve verifications and alerts instantly',
    body: 'Handle balance queries, identity verification and payment reminders with a calm, compliant agent — audit-logged end to end, with concessions inside your guardrails.',
    metrics: [{ value: 'PCI', label: 'compliant flow' }, { value: '<500ms', label: 'response' }],
    to: '/solutions/verticals/finance',
  },
  retail: {
    name: 'Retail & e-commerce', short: 'First-contact returns and order help', accent: 'var(--lime)', kicker: 'RETAIL & E-COMMERCE',
    title: 'Simplify returns with always-on assistance',
    body: 'Let customers start returns, track orders and get refunds through an agent that solves problems on the first interaction — and hands off with full context when it can’t.',
    metrics: [{ value: '71%', label: 'self-resolved' }, { value: '0 hold', label: 'wait time' }],
    to: '/solutions/verticals/ecommerce',
  },
  restaurants: {
    name: 'Restaurants', short: 'Book more covers, 24/7', accent: 'var(--coral)', kicker: 'RESTAURANTS',
    title: 'Take every booking, around the clock',
    body: 'Diners check availability, get answers and book instantly — no wait times, no missed covers, in the caller’s own language across 40+ voices.',
    metrics: [{ value: '+2.4×', label: 'answered calls' }, { value: '40+', label: 'languages' }],
    to: '/solutions/verticals/restaurants',
  },
};

/* ── Stats + compliance ────────────────────────────────────────────────── */

export const BIG_STATS = [
  { kicker: 'LANGUAGES & VOICES',   value: '40+',    body: 'Real-time multilingual conversation with natural accents and voices.' },
  { kicker: 'FIRST RESPONSE',       value: '<500ms', body: 'End-to-end latency that keeps the conversation feeling human.' },
  { kicker: 'CALLS PER CAMPAIGN',   value: '1000s',  body: 'Outbound at scale with pacing, retries and per-call outcomes.' },
];

export const BADGES = ['SOC 2', 'HIPAA-aware', 'GDPR', 'PCI-ready', 'Call recording consent'];
