/* ─────────────────────────────────────────────────────────────────────────
   Mock Call Logs — 30 realistic conversations across all 5 templates
───────────────────────────────────────────────────────────────────────── */

export type CallStatus = 'completed' | 'missed' | 'transferred' | 'failed' | 'voicemail';
export type Sentiment  = 'positive' | 'neutral' | 'negative';
export type TemplateId = 'lead-generation' | 'collections' | 'negotiation' | 'customer-support' | 'appointments';

export interface TranscriptLine {
  speaker: 'agent' | 'customer';
  text: string;
  ts: string; // "00:12"
}

export interface CallLog {
  id: string;
  customerName: string;
  phone: string;
  timestamp: string;           // ISO
  durationSec: number;
  status: CallStatus;
  outcome: string;
  agent: string;
  template: TemplateId;
  intent: string;
  sentiment: Sentiment;
  summary: string;
  transcript: TranscriptLine[];
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function iso(daysAgo: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const phones = [
  '+1 (555) 204-8821', '+1 (555) 384-0012', '+1 (555) 918-3344', '+44 20 7946 0958',
  '+1 (555) 672-1190', '+91 98765 43210', '+1 (555) 555-0199', '+61 2 9374 4000',
  '+1 (555) 321-7654', '+1 (555) 876-4400', '+1 (555) 112-9873', '+49 30 12345678',
  '+1 (555) 444-3321', '+1 (555) 007-0042', '+1 (555) 893-2217',
];

const agents = ['Apex-v1', 'Nova-v2', 'Clio-v3', 'Iris-v1', 'Atlas-v2'];

/* ── 30 logs ─────────────────────────────────────────────────────────── */
export const mockCallLogs: CallLog[] = [

  /* ── Lead Generation (8) ──────────────────────────────────────── */
  {
    id: 'CL-0001', customerName: 'Priya Sharma', phone: phones[0], timestamp: iso(0, 9, 14),
    durationSec: 247, status: 'completed', outcome: 'Demo Booked', agent: agents[0],
    template: 'lead-generation', intent: 'Book Demo', sentiment: 'positive',
    summary: 'Priya expressed strong interest in the outbound calling features. Budget confirmed at $500/mo. Demo scheduled for next Tuesday at 11 AM.',
    transcript: [
      { speaker: 'agent', text: "Hi, this is Apex from OmniDimension. Do you have a moment to chat about automating your outbound calls?", ts: '00:00' },
      { speaker: 'customer', text: "Sure, I've actually been looking into something like this.", ts: '00:06' },
      { speaker: 'agent', text: "Great! Could I ask what your primary use case would be — lead gen, support, or appointments?", ts: '00:12' },
      { speaker: 'customer', text: "Mostly lead qualification. We make about 300 calls a week manually.", ts: '00:18' },
      { speaker: 'agent', text: "That's exactly what we specialise in. What's your budget range?", ts: '00:25' },
      { speaker: 'customer', text: "Around $500 a month, maybe more if it delivers.", ts: '00:30' },
      { speaker: 'agent', text: "Perfect. I'd love to set up a personalised demo. Are you free Tuesday at 11 AM?", ts: '00:37' },
      { speaker: 'customer', text: "Tuesday works perfectly.", ts: '00:41' },
    ],
  },
  {
    id: 'CL-0002', customerName: 'Marcus Webb', phone: phones[1], timestamp: iso(0, 14, 30),
    durationSec: 94, status: 'completed', outcome: 'Lead Qualified', agent: agents[1],
    template: 'lead-generation', intent: 'Pricing Enquiry', sentiment: 'neutral',
    summary: 'Marcus asked about pricing and enterprise tiers. Shared pricing deck. Follow-up email sent. No immediate timeline.',
    transcript: [
      { speaker: 'agent', text: "Hello Marcus, I'm calling regarding your inquiry on our website.", ts: '00:00' },
      { speaker: 'customer', text: "Yes, I wanted to understand pricing before going further.", ts: '00:05' },
      { speaker: 'agent', text: "Of course! Our plans start at $99/month. Are you looking for team or enterprise?", ts: '00:10' },
      { speaker: 'customer', text: "Enterprise most likely, we have 50 reps.", ts: '00:16' },
      { speaker: 'agent', text: "I'll send you our enterprise deck now. What's the best email?", ts: '00:20' },
    ],
  },
  {
    id: 'CL-0003', customerName: 'Sarah O\'Brien', phone: phones[2], timestamp: iso(1, 10, 0),
    durationSec: 38, status: 'missed', outcome: 'No Answer', agent: agents[2],
    template: 'lead-generation', intent: 'Product Info', sentiment: 'neutral',
    summary: 'Call went unanswered. Voicemail left with callback number.',
    transcript: [
      { speaker: 'agent', text: "Hi Sarah, calling from OmniDimension about your recent inquiry. Please call us back at...", ts: '00:00' },
    ],
  },
  {
    id: 'CL-0004', customerName: 'Kenji Tanaka', phone: phones[3], timestamp: iso(1, 15, 45),
    durationSec: 312, status: 'completed', outcome: 'Meeting Scheduled', agent: agents[0],
    template: 'lead-generation', intent: 'Product Demo', sentiment: 'positive',
    summary: 'Kenji is CTO at a 200-person SaaS company. Very interested in API integration. Meeting with technical team arranged for Thursday.',
    transcript: [
      { speaker: 'agent', text: "Good afternoon Kenji! I understand you're evaluating AI calling solutions.", ts: '00:00' },
      { speaker: 'customer', text: "Yes, we need something with a strong API — our team will integrate it into our CRM.", ts: '00:07' },
      { speaker: 'agent', text: "We have a REST API with webhooks and Salesforce integration out of the box. Want a technical deep-dive?", ts: '00:15' },
      { speaker: 'customer', text: "Absolutely. Can we include my senior engineer?", ts: '00:22' },
      { speaker: 'agent', text: "Of course. I'll set up a 45-minute technical session for Thursday at 3 PM.", ts: '00:28' },
    ],
  },
  {
    id: 'CL-0005', customerName: 'Fatima Al-Hassan', phone: phones[4], timestamp: iso(2, 11, 20),
    durationSec: 178, status: 'completed', outcome: 'Unqualified', agent: agents[3],
    template: 'lead-generation', intent: 'Product Info', sentiment: 'neutral',
    summary: 'Lead budget is below threshold ($50/mo). Call volume too low (20 calls/week). Not a good fit at this time.',
    transcript: [
      { speaker: 'agent', text: "Hi Fatima, thanks for your interest. What volume of calls do you handle weekly?", ts: '00:00' },
      { speaker: 'customer', text: "About 20, maybe 25 on a busy week.", ts: '00:06' },
      { speaker: 'agent', text: "And what budget are you working with for automation?", ts: '00:10' },
      { speaker: 'customer', text: "Honestly around $50 a month. Is that enough?", ts: '00:15' },
    ],
  },
  {
    id: 'CL-0006', customerName: 'Ravi Menon', phone: phones[5], timestamp: iso(3, 9, 5),
    durationSec: 205, status: 'completed', outcome: 'Demo Booked', agent: agents[4],
    template: 'lead-generation', intent: 'Book Demo', sentiment: 'positive',
    summary: 'Ravi runs a real estate agency and wants to automate property inquiry follow-ups. Booked Friday 2 PM demo.',
    transcript: [
      { speaker: 'agent', text: "Hi Ravi! I hear you're exploring AI calling for real estate.", ts: '00:00' },
      { speaker: 'customer', text: "Yes — we get 50 inquiries a day and our team can't keep up.", ts: '00:06' },
      { speaker: 'agent', text: "Our platform can qualify and respond to all 50 within seconds. Want to see it live?", ts: '00:13' },
      { speaker: 'customer', text: "Definitely. Friday afternoon works for me.", ts: '00:19' },
    ],
  },
  {
    id: 'CL-0007', customerName: 'Emma Johansson', phone: phones[6], timestamp: iso(4, 13, 0),
    durationSec: 62, status: 'failed', outcome: 'Technical Error', agent: agents[1],
    template: 'lead-generation', intent: 'Product Info', sentiment: 'negative',
    summary: 'Call dropped after 62 seconds due to network issue. Customer not reached again.',
    transcript: [
      { speaker: 'agent', text: "Hello Emma, I'm reaching out about your inquiry on AI voice automation.", ts: '00:00' },
      { speaker: 'customer', text: "Hi yes, I wanted to know more about—", ts: '00:06' },
      { speaker: 'agent', text: "Of course! We offer—", ts: '00:09' },
    ],
  },
  {
    id: 'CL-0008', customerName: 'Tom Richards', phone: phones[7], timestamp: iso(5, 10, 30),
    durationSec: 418, status: 'transferred', outcome: 'Escalated to Sales', agent: agents[2],
    template: 'lead-generation', intent: 'Enterprise Pricing', sentiment: 'positive',
    summary: 'Tom is VP Sales at a 1000-person company. Deal size too large for automated flow. Transferred to enterprise sales rep.',
    transcript: [
      { speaker: 'agent', text: "Tom, to get you the right information, how many agents are on your team?", ts: '00:00' },
      { speaker: 'customer', text: "We have 200 sales reps globally.", ts: '00:05' },
      { speaker: 'agent', text: "That's our enterprise tier. Let me connect you with our enterprise specialist now.", ts: '00:11' },
    ],
  },

  /* ── Collections (6) ──────────────────────────────────────────── */
  {
    id: 'CL-0009', customerName: 'David Okafor', phone: phones[8], timestamp: iso(0, 10, 45),
    durationSec: 334, status: 'completed', outcome: 'Full Payment', agent: agents[0],
    template: 'collections', intent: 'Payment', sentiment: 'positive',
    summary: 'David agreed to pay the full outstanding balance of $1,247.50 via debit card. Payment processed successfully.',
    transcript: [
      { speaker: 'agent', text: "Good morning, may I speak with David Okafor? This is regarding account #4821.", ts: '00:00' },
      { speaker: 'customer', text: "Speaking. Is this about the overdue bill?", ts: '00:06' },
      { speaker: 'agent', text: "Yes. The outstanding balance is $1,247.50. Are you in a position to settle today?", ts: '00:11' },
      { speaker: 'customer', text: "Yes, I can pay the full amount now. Use the card on file.", ts: '00:17' },
      { speaker: 'agent', text: "Processing now... Payment confirmed. You'll receive a receipt by email.", ts: '00:22' },
    ],
  },
  {
    id: 'CL-0010', customerName: 'Linda Patel', phone: phones[9], timestamp: iso(1, 11, 15),
    durationSec: 287, status: 'completed', outcome: 'Payment Plan', agent: agents[3],
    template: 'collections', intent: 'Payment Plan', sentiment: 'neutral',
    summary: 'Linda set up a 6-month payment plan of $208/month. First payment taken today.',
    transcript: [
      { speaker: 'agent', text: "Hello Linda, calling about your account balance of $1,247. Can we discuss payment options?", ts: '00:00' },
      { speaker: 'customer', text: "I can't pay it all at once. Is a payment plan possible?", ts: '00:07' },
      { speaker: 'agent', text: "Absolutely. We offer 3, 6 or 12 months. Which works best?", ts: '00:12' },
      { speaker: 'customer', text: "6 months please.", ts: '00:16' },
      { speaker: 'agent', text: "That's $208/month. First payment due today. Shall I process it?", ts: '00:20' },
    ],
  },
  {
    id: 'CL-0011', customerName: 'Carlos Mendez', phone: phones[10], timestamp: iso(2, 9, 0),
    durationSec: 145, status: 'completed', outcome: 'Dispute Filed', agent: agents[1],
    template: 'collections', intent: 'Dispute', sentiment: 'negative',
    summary: 'Carlos disputes the charge, claims payment was made 2 weeks ago. Dispute logged; verification team notified.',
    transcript: [
      { speaker: 'agent', text: "Hi Carlos, calling about the balance of $1,247 on your account.", ts: '00:00' },
      { speaker: 'customer', text: "That's wrong — I paid this two weeks ago!", ts: '00:05' },
      { speaker: 'agent', text: "I understand your frustration. I'm logging a dispute right now. Can you share your payment confirmation number?", ts: '00:10' },
      { speaker: 'customer', text: "It's TXN-98234.", ts: '00:16' },
      { speaker: 'agent', text: "Dispute filed. Our verification team will respond within 5 business days.", ts: '00:20' },
    ],
  },
  {
    id: 'CL-0012', customerName: 'Angela Foster', phone: phones[11], timestamp: iso(3, 14, 20),
    durationSec: 58, status: 'voicemail', outcome: 'Voicemail Left', agent: agents[4],
    template: 'collections', intent: 'Payment', sentiment: 'neutral',
    summary: 'No answer. Voicemail left requesting callback.',
    transcript: [
      { speaker: 'agent', text: "Hi Angela, this is a message regarding your account. Please call us at 1-800-555-0199.", ts: '00:00' },
    ],
  },
  {
    id: 'CL-0013', customerName: 'Benjamin Achebe', phone: phones[12], timestamp: iso(4, 8, 45),
    durationSec: 402, status: 'transferred', outcome: 'Hardship Programme', agent: agents[2],
    template: 'collections', intent: 'Financial Hardship', sentiment: 'negative',
    summary: 'Benjamin disclosed job loss. Transferred to hardship specialist team for tailored support options.',
    transcript: [
      { speaker: 'agent', text: "Benjamin, can you tell me more about your current situation?", ts: '00:00' },
      { speaker: 'customer', text: "I lost my job last month. I genuinely can't pay right now.", ts: '00:06' },
      { speaker: 'agent', text: "I completely understand. We have a hardship programme — I'll connect you with a specialist now.", ts: '00:13' },
    ],
  },
  {
    id: 'CL-0014', customerName: 'Nadia Kowalski', phone: phones[13], timestamp: iso(6, 11, 0),
    durationSec: 199, status: 'completed', outcome: 'Partial Payment', agent: agents[0],
    template: 'collections', intent: 'Partial Payment', sentiment: 'neutral',
    summary: 'Nadia paid $500 today with remaining balance due in 30 days.',
    transcript: [
      { speaker: 'agent', text: "Nadia, the outstanding amount is $1,247. Are you able to make a partial payment?", ts: '00:00' },
      { speaker: 'customer', text: "I can do $500 now and the rest next month.", ts: '00:06' },
      { speaker: 'agent', text: "$500 processed. Remaining $747 due in 30 days. Confirmation sent to your email.", ts: '00:13' },
    ],
  },

  /* ── Negotiation (5) ──────────────────────────────────────────── */
  {
    id: 'CL-0015', customerName: 'James Thornton', phone: phones[14], timestamp: iso(1, 10, 0),
    durationSec: 528, status: 'completed', outcome: 'Deal Closed', agent: agents[1],
    template: 'negotiation', intent: 'Contract Renewal', sentiment: 'positive',
    summary: 'Negotiated a 15% discount on a 24-month renewal. James accepted. Contract sent for e-signature.',
    transcript: [
      { speaker: 'agent', text: "James, your contract renewal is coming up. We'd love to keep you on board.", ts: '00:00' },
      { speaker: 'customer', text: "I've been shopping around. What can you offer?", ts: '00:06' },
      { speaker: 'agent', text: "For a 24-month commitment, I can go to 15% off current rates.", ts: '00:12' },
      { speaker: 'customer', text: "Make it 18% and we have a deal.", ts: '00:17' },
      { speaker: 'agent', text: "I can do 16% — that's our ceiling without management approval.", ts: '00:22' },
      { speaker: 'customer', text: "Deal. Send it over.", ts: '00:27' },
    ],
  },
  {
    id: 'CL-0016', customerName: 'Rachel Kim', phone: phones[0], timestamp: iso(2, 15, 30),
    durationSec: 376, status: 'completed', outcome: 'Counteroffer Sent', agent: agents[3],
    template: 'negotiation', intent: 'Pricing', sentiment: 'neutral',
    summary: 'Rachel countered with a 25% discount request. Agent offered 12%. Counteroffer document sent; awaiting reply.',
    transcript: [
      { speaker: 'agent', text: "Rachel, I understand you're looking for better pricing. What's the target?", ts: '00:00' },
      { speaker: 'customer', text: "We need at least 25% off to justify the spend.", ts: '00:06' },
      { speaker: 'agent', text: "I can go up to 12% today, with review at 6 months. Let me send you a formal counter.", ts: '00:14' },
    ],
  },
  {
    id: 'CL-0017', customerName: 'Victor Reyes', phone: phones[1], timestamp: iso(3, 12, 0),
    durationSec: 612, status: 'transferred', outcome: 'Escalated', agent: agents[4],
    template: 'negotiation', intent: 'SLA Terms', sentiment: 'negative',
    summary: 'Victor demanded custom SLA terms beyond agent authority. Escalated to Account Director.',
    transcript: [
      { speaker: 'agent', text: "Victor, what specific SLA changes are you looking for?", ts: '00:00' },
      { speaker: 'customer', text: "99.99% uptime guarantee and 15-minute support response.", ts: '00:06' },
      { speaker: 'agent', text: "Those terms require director sign-off. Let me escalate to our Account Director now.", ts: '00:13' },
    ],
  },
  {
    id: 'CL-0018', customerName: 'Amara Diallo', phone: phones[2], timestamp: iso(5, 9, 30),
    durationSec: 298, status: 'completed', outcome: 'Agreement Reached', agent: agents[2],
    template: 'negotiation', intent: 'Volume Discount', sentiment: 'positive',
    summary: 'Amara secured a volume discount for 500 units at 10% off. Purchase order expected by end of week.',
    transcript: [
      { speaker: 'agent', text: "Amara, for 500 units, I can offer 10% discount plus free onboarding.", ts: '00:00' },
      { speaker: 'customer', text: "That works. We'll send the PO by Friday.", ts: '00:06' },
    ],
  },
  {
    id: 'CL-0019', customerName: 'Oliver Stone', phone: phones[3], timestamp: iso(6, 14, 0),
    durationSec: 142, status: 'missed', outcome: 'No Answer', agent: agents[0],
    template: 'negotiation', intent: 'Contract', sentiment: 'neutral',
    summary: 'No answer. Callback scheduled for tomorrow.',
    transcript: [
      { speaker: 'agent', text: "Oliver, this is Apex calling to discuss your contract renewal options.", ts: '00:00' },
    ],
  },

  /* ── Customer Support (6) ─────────────────────────────────────── */
  {
    id: 'CL-0020', customerName: 'Sophie Turner', phone: phones[4], timestamp: iso(0, 11, 0),
    durationSec: 384, status: 'completed', outcome: 'Issue Resolved', agent: agents[1],
    template: 'customer-support', intent: 'Refund Request', sentiment: 'positive',
    summary: 'Sophie requested a refund for order #ORD-8821. Refund of $89.99 initiated; 3-5 business days to credit.',
    transcript: [
      { speaker: 'agent', text: "Hi Sophie, how can I help you today?", ts: '00:00' },
      { speaker: 'customer', text: "I'd like a refund for order #ORD-8821. It arrived damaged.", ts: '00:05' },
      { speaker: 'agent', text: "I'm so sorry about that. I've initiated a full refund of $89.99. You'll see it in 3-5 days.", ts: '00:11' },
      { speaker: 'customer', text: "Thank you! That was quick.", ts: '00:17' },
    ],
  },
  {
    id: 'CL-0021', customerName: 'Daniel Park', phone: phones[5], timestamp: iso(1, 9, 20),
    durationSec: 547, status: 'completed', outcome: 'Ticket Created', agent: agents[4],
    template: 'customer-support', intent: 'Technical Issue', sentiment: 'negative',
    summary: 'Daniel reported an app crash on iOS 17. Bug ticket #TKT-4412 opened. Engineering team notified.',
    transcript: [
      { speaker: 'agent', text: "Daniel, can you describe the technical issue?", ts: '00:00' },
      { speaker: 'customer', text: "The app crashes every time I try to upload a file on my iPhone 14.", ts: '00:06' },
      { speaker: 'agent', text: "I see — that's a known iOS 17 issue. I've raised ticket #TKT-4412 for engineering. You'll hear back within 24 hours.", ts: '00:14' },
    ],
  },
  {
    id: 'CL-0022', customerName: 'Isabella Rossi', phone: phones[6], timestamp: iso(2, 13, 45),
    durationSec: 213, status: 'completed', outcome: 'Information Provided', agent: agents[2],
    template: 'customer-support', intent: 'Order Tracking', sentiment: 'neutral',
    summary: 'Isabella tracked order #ORD-7734. Package in transit, estimated delivery tomorrow.',
    transcript: [
      { speaker: 'agent', text: "Hi Isabella! What can I help you with?", ts: '00:00' },
      { speaker: 'customer', text: "Where is my order #ORD-7734?", ts: '00:04' },
      { speaker: 'agent', text: "Your package is in transit — estimated delivery is tomorrow by 6 PM.", ts: '00:09' },
    ],
  },
  {
    id: 'CL-0023', customerName: 'Hassan Al-Farsi', phone: phones[7], timestamp: iso(3, 10, 30),
    durationSec: 476, status: 'transferred', outcome: 'Human Agent', agent: agents[0],
    template: 'customer-support', intent: 'Billing Dispute', sentiment: 'negative',
    summary: 'Hassan extremely frustrated about double charge. Transferred to billing team.',
    transcript: [
      { speaker: 'agent', text: "Hassan, I see a double charge on your account. Let me connect you with billing.", ts: '00:00' },
      { speaker: 'customer', text: "I've been charged twice! This is unacceptable!", ts: '00:05' },
      { speaker: 'agent', text: "I completely understand your frustration. Connecting you now to our priority billing team.", ts: '00:10' },
    ],
  },
  {
    id: 'CL-0024', customerName: 'Mei Lin', phone: phones[8], timestamp: iso(4, 16, 0),
    durationSec: 88, status: 'completed', outcome: 'Password Reset', agent: agents[3],
    template: 'customer-support', intent: 'Account Access', sentiment: 'positive',
    summary: 'Mei was locked out of her account. Password reset link sent to verified email.',
    transcript: [
      { speaker: 'agent', text: "Mei, I'll send you a secure password reset link to your verified email.", ts: '00:00' },
      { speaker: 'customer', text: "Perfect, thank you!", ts: '00:05' },
    ],
  },
  {
    id: 'CL-0025', customerName: 'George Williams', phone: phones[9], timestamp: iso(7, 11, 10),
    durationSec: 322, status: 'completed', outcome: 'Subscription Retained', agent: agents[1],
    template: 'customer-support', intent: 'Cancellation', sentiment: 'neutral',
    summary: 'George was going to cancel but accepted a 2-month free offer. Subscription retained.',
    transcript: [
      { speaker: 'agent', text: "George, I understand you're thinking of cancelling. Can I ask what prompted this?", ts: '00:00' },
      { speaker: 'customer', text: "It's too expensive for what I use.", ts: '00:05' },
      { speaker: 'agent', text: "What if we paused your account for 2 months at no charge?", ts: '00:10' },
      { speaker: 'customer', text: "That actually sounds fair. Let's do that.", ts: '00:15' },
    ],
  },

  /* ── Appointments (5) ────────────────────────────────────────── */
  {
    id: 'CL-0026', customerName: 'Charlotte Brown', phone: phones[10], timestamp: iso(0, 9, 0),
    durationSec: 178, status: 'completed', outcome: 'Appointment Booked', agent: agents[2],
    template: 'appointments', intent: 'Book Appointment', sentiment: 'positive',
    summary: 'Charlotte booked a dental consultation for next Monday at 10 AM. Confirmation SMS sent.',
    transcript: [
      { speaker: 'agent', text: "Hi Charlotte! Would you like to book an appointment?", ts: '00:00' },
      { speaker: 'customer', text: "Yes, for a dental check-up please.", ts: '00:05' },
      { speaker: 'agent', text: "I have Monday at 10 AM or Wednesday at 2 PM. Which works?", ts: '00:10' },
      { speaker: 'customer', text: "Monday at 10 is perfect.", ts: '00:15' },
      { speaker: 'agent', text: "Booked! Confirmation sent via SMS.", ts: '00:18' },
    ],
  },
  {
    id: 'CL-0027', customerName: 'Nathan Lee', phone: phones[11], timestamp: iso(1, 14, 30),
    durationSec: 203, status: 'completed', outcome: 'Rescheduled', agent: agents[4],
    template: 'appointments', intent: 'Reschedule', sentiment: 'neutral',
    summary: 'Nathan rescheduled from Tuesday to Thursday 3 PM. Updated confirmation sent.',
    transcript: [
      { speaker: 'agent', text: "Hi Nathan, you have an appointment Tuesday at 2 PM. Would you like to keep it?", ts: '00:00' },
      { speaker: 'customer', text: "Can I move it to Thursday?", ts: '00:05' },
      { speaker: 'agent', text: "Thursday at 3 PM is available. Rescheduled — confirmation sent.", ts: '00:10' },
    ],
  },
  {
    id: 'CL-0028', customerName: 'Aisha Mahmoud', phone: phones[12], timestamp: iso(2, 11, 0),
    durationSec: 143, status: 'completed', outcome: 'Appointment Cancelled', agent: agents[0],
    template: 'appointments', intent: 'Cancel', sentiment: 'neutral',
    summary: 'Aisha cancelled her appointment. Offered reschedule, declined. Slot released.',
    transcript: [
      { speaker: 'agent', text: "Aisha, I'm confirming your Friday appointment. Everything still on?", ts: '00:00' },
      { speaker: 'customer', text: "Actually I need to cancel. Something came up.", ts: '00:05' },
      { speaker: 'agent', text: "No problem. Would you like to reschedule?", ts: '00:09' },
      { speaker: 'customer', text: "Not right now, thanks.", ts: '00:12' },
      { speaker: 'agent', text: "Cancelled. Call us anytime to rebook.", ts: '00:15' },
    ],
  },
  {
    id: 'CL-0029', customerName: 'Felix Müller', phone: phones[13], timestamp: iso(3, 8, 30),
    durationSec: 221, status: 'completed', outcome: 'Intake Collected', agent: agents[3],
    template: 'appointments', intent: 'Pre-Appointment', sentiment: 'positive',
    summary: 'Felix confirmed appointment and provided pre-appointment intake information. All data logged.',
    transcript: [
      { speaker: 'agent', text: "Felix, calling to confirm your appointment and collect a few intake details.", ts: '00:00' },
      { speaker: 'customer', text: "Sure, go ahead.", ts: '00:04' },
      { speaker: 'agent', text: "Any allergies or current medications?", ts: '00:07' },
      { speaker: 'customer', text: "No allergies. I take metformin 500mg.", ts: '00:12' },
      { speaker: 'agent', text: "Noted. Your appointment is confirmed. See you Thursday!", ts: '00:17' },
    ],
  },
  {
    id: 'CL-0030', customerName: 'Nina Johansson', phone: phones[14], timestamp: iso(5, 15, 45),
    durationSec: 78, status: 'missed', outcome: 'No Answer', agent: agents[1],
    template: 'appointments', intent: 'Confirmation', sentiment: 'neutral',
    summary: 'Confirmation call went unanswered. SMS reminder sent as fallback.',
    transcript: [
      { speaker: 'agent', text: "Hi Nina, calling to confirm your appointment tomorrow at 9 AM. An SMS has been sent.", ts: '00:00' },
    ],
  },
];

/* ── Aggregate helpers used by the analytics dashboard ────────────── */

export function getKPIs() {
  const total = mockCallLogs.length;
  const completed = mockCallLogs.filter(c => c.status === 'completed').length;
  const totalDuration = mockCallLogs.reduce((s, c) => s + c.durationSec, 0);
  const avgDuration = Math.round(totalDuration / total);
  const positive = mockCallLogs.filter(c => c.sentiment === 'positive').length;
  const leadsQualified = mockCallLogs.filter(c => c.template === 'lead-generation' && c.outcome !== 'Unqualified' && c.status === 'completed').length;
  const apptBooked = mockCallLogs.filter(c => c.template === 'appointments' && c.outcome === 'Appointment Booked').length;

  return {
    totalCalls: total,
    successfulConversations: completed,
    avgDurationSec: avgDuration,
    avgResponseTimeMs: 420,
    appointmentsBooked: apptBooked,
    leadsQualified,
    customerSatisfaction: Math.round((positive / total) * 100),
    automationRate: Math.round((completed / total) * 100),
  };
}

export function getCallsOverTime(): { date: string; calls: number }[] {
  const map = new Map<string, number>();
  mockCallLogs.forEach(c => {
    const d = new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    map.set(d, (map.get(d) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([date, calls]) => ({ date, calls }));
}

export function getOutcomeBreakdown() {
  const counts: Record<string, number> = { Completed: 0, Missed: 0, Transferred: 0, Failed: 0, Voicemail: 0 };
  mockCallLogs.forEach(c => {
    if (c.status === 'completed')   counts['Completed']++;
    else if (c.status === 'missed') counts['Missed']++;
    else if (c.status === 'transferred') counts['Transferred']++;
    else if (c.status === 'failed') counts['Failed']++;
    else if (c.status === 'voicemail') counts['Voicemail']++;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export function getDurationBuckets() {
  const buckets = [
    { range: '0-1 min', min: 0, max: 60 },
    { range: '1-3 min', min: 60, max: 180 },
    { range: '3-5 min', min: 180, max: 300 },
    { range: '5-10 min', min: 300, max: 600 },
    { range: '10+ min', min: 600, max: Infinity },
  ];
  return buckets.map(b => ({
    range: b.range,
    calls: mockCallLogs.filter(c => c.durationSec >= b.min && c.durationSec < b.max).length,
  }));
}

export function getTopIntents() {
  const map = new Map<string, number>();
  mockCallLogs.forEach(c => map.set(c.intent, (map.get(c.intent) || 0) + 1));
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([intent, count]) => ({ intent, count }));
}
