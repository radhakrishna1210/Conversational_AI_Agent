/* ──────────────────────────────────────────────────────────────────────────
   Mock response engine — template-aware conversational AI simulation.
   Each template has an ordered list of (pattern → reply) pairs.
   Falls back to a generic reply if no pattern matches.
────────────────────────────────────────────────────────────────────────── */

interface MockRule {
  patterns: RegExp[];
  reply: string | ((matched: RegExpMatchArray) => string);
}

interface TemplateMocks {
  quickPrompts: string[];
  rules: MockRule[];
  fallbacks: string[];
}

const MOCKS: Record<string, TemplateMocks> = {
  'lead-generation': {
    quickPrompts: [
      'Tell me about your product',
      'Book a demo',
      'What are your pricing plans?',
      'Contact sales',
    ],
    rules: [
      {
        patterns: [/\b(hi|hello|hey|good morning|good afternoon|yo)\b/i],
        reply: "Hi there! I'm your lead qualification assistant. Could I get your name and the company you're calling from?",
      },
      {
        patterns: [/\b(product|services?|what do you (do|offer)|tell me about)\b/i],
        reply: "Great question! We offer an AI-powered voice agent platform that helps businesses automate outbound calls, qualify leads, and book appointments at scale. To give you a more tailored overview — what's your primary use case?",
      },
      {
        patterns: [/\b(demo|demonstration|see it in action|trial)\b/i],
        reply: "Absolutely! I'd love to set up a personalised demo for you. What's your email address, and would morning or afternoon work better for you?",
      },
      {
        patterns: [/\b(pric(e|ing)|cost|how much|plan|subscription)\b/i],
        reply: "Our plans start at $99/month for small teams and scale with usage. Could I ask roughly how many calls per month you're looking to handle? That'll help me point you to the right tier.",
      },
      {
        patterns: [/\b(contact|sales|speak to someone|human|agent)\b/i],
        reply: "Of course! Let me connect you with one of our account executives. Could I grab your full name and best phone number first?",
      },
      {
        patterns: [/\b(budget|afford|expensive|cheap)\b/i],
        reply: "I completely understand — budget is always a factor. We have flexible plans and can customise packages. What does your monthly budget look like for this type of solution?",
      },
      {
        patterns: [/\b(timeline|when|urgent|soon|start)\b/i],
        reply: "That's helpful to know. Are you looking to deploy something within the next 30 days, or are you in an earlier evaluation phase?",
      },
    ],
    fallbacks: [
      "That's interesting! Could you tell me a bit more about your business so I can tailor my recommendations?",
      "Thanks for sharing that. To qualify you better — how large is your sales team currently?",
      "Got it. Would it be helpful if I walked you through a quick 2-minute overview of what we can do for you?",
    ],
  },

  collections: {
    quickPrompts: [
      'I want to make a payment',
      'Set up a payment plan',
      'Dispute this charge',
      'When is my due date?',
    ],
    rules: [
      {
        patterns: [/\b(hi|hello|hey)\b/i],
        reply: "Hello! I'm calling on behalf of your account services team. Before we proceed, could I verify your full name and the last 4 digits of the account number on file?",
      },
      {
        patterns: [/\b(pay(ment)?|pay now|settle|clear)\b/i],
        reply: "I'd be happy to help you make a payment today. The total outstanding balance is $1,247.50. Would you like to pay in full, or would a payment plan work better for your situation?",
      },
      {
        patterns: [/\b(plan|instalment|partial|afford|monthly)\b/i],
        reply: "Understood — a payment plan is a great option. We can arrange 3, 6, or 12 monthly instalments. Which would work best for you?",
      },
      {
        patterns: [/\b(dispute|wrong|error|mistake|not mine|don't owe)\b/i],
        reply: "I understand your concern. I'll log a dispute on your behalf right now. Could you explain briefly why you believe this charge is incorrect? We'll review it within 5 business days.",
      },
      {
        patterns: [/\b(due date|deadline|when|date)\b/i],
        reply: "Your current due date is the 15th of this month. A late fee of $25 applies after that date. Would you like to make a payment now to avoid the fee?",
      },
      {
        patterns: [/\b(can'?t pay|no money|broke|hardship|financial)\b/i],
        reply: "I completely understand that situations can be difficult. We do have a financial hardship programme available — let me connect you with our specialist team who can discuss your options in more detail.",
      },
    ],
    fallbacks: [
      "I understand. Let me pull up your account details. Could you confirm the account number or the phone number associated with the account?",
      "Thank you for letting me know. What would be the most convenient way to resolve this account today?",
      "I appreciate your patience. Is there anything specific I can help clarify about your account?",
    ],
  },

  negotiation: {
    quickPrompts: [
      "I'm not happy with the price",
      "Can we extend the contract?",
      "What's your best offer?",
      "We need better terms",
    ],
    rules: [
      {
        patterns: [/\b(hi|hello|hey)\b/i],
        reply: "Good to speak with you. I'm reaching out to discuss your account renewal and explore terms that work well for both sides. Do you have a few minutes?",
      },
      {
        patterns: [/\b(price|expensive|cost|too much|high|discount|cheaper|reduce)\b/i],
        reply: "I hear you — pricing is always important. We do have some flexibility depending on commitment length and volume. If you could share what you had in mind, I can see what's possible within our parameters.",
      },
      {
        patterns: [/\b(extend|renew|renewal|longer|term|contract)\b/i],
        reply: "Extending the contract is definitely an option. Typically, a 24-month commitment unlocks our best pricing tier. What length are you comfortable with?",
      },
      {
        patterns: [/\b(best offer|final (offer|price)|best you can do)\b/i],
        reply: "I appreciate you asking directly. For your account size and a 12-month term, the best I can offer is a 15% discount off the current rate. That's our strongest position without escalating to a manager. Does that help?",
      },
      {
        patterns: [/\b(terms|conditions|clause|agreement|SLA|service level)\b/i],
        reply: "We can certainly discuss adjustments to the terms. Which specific conditions are you looking to change — payment terms, SLA guarantees, or usage caps?",
      },
      {
        patterns: [/\b(competitor|alternative|switching|leaving|cancel)\b/i],
        reply: "I understand you're evaluating options — that's completely fair. Before any decision, I'd like to understand what would need to be different for us to remain your partner. What matters most to you?",
      },
    ],
    fallbacks: [
      "That's a fair point. Let me explore what flexibility I have on my side. What would an acceptable outcome look like for you?",
      "I want to make sure we find something that works for both parties. Can you share a bit more about your priorities?",
      "Understood. Let me note that down. Is there anything else on the table you'd like to discuss before we work towards an agreement?",
    ],
  },

  'customer-support': {
    quickPrompts: [
      "My order hasn't arrived",
      'Request a refund',
      'I have a technical issue',
      'Track my order',
    ],
    rules: [
      {
        patterns: [/\b(hi|hello|hey)\b/i],
        reply: "Hello! Thank you for reaching out to support. I'm your AI assistant — I'm here to help. Could you briefly describe the issue you're experiencing today?",
      },
      {
        patterns: [/\b(order|delivered|arrived|shipping|package|parcel)\b/i],
        reply: "I'm sorry to hear your order hasn't arrived. Could you share your order ID so I can look into this for you right away?",
      },
      {
        patterns: [/\b(refund|money back|return|reimburse|credit)\b/i],
        reply: "I completely understand. I'd be glad to initiate a refund for you. Could you share your order ID and the reason for the refund? This helps us process it faster.",
      },
      {
        patterns: [/\b(technical|bug|error|crash|not working|broken|issue|problem)\b/i],
        reply: "I'm sorry you're experiencing a technical issue. Let's get this sorted! Could you describe exactly what's happening — including any error messages you're seeing?",
      },
      {
        patterns: [/\b(track|where is|status|location|update)\b/i],
        reply: "Of course! Share your order number and I'll pull up the latest tracking information for you immediately.",
      },
      {
        patterns: [/\b(angry|frustrated|unacceptable|terrible|worst|awful)\b/i],
        reply: "I sincerely apologise for the experience you've had — that's completely unacceptable. I want to make this right. Let me escalate this to our priority support team right now.",
      },
      {
        patterns: [/\b(password|login|account|sign in|access)\b/i],
        reply: "No problem — account issues are easy to sort. Could you confirm the email address linked to your account? I'll send you a secure reset link straightaway.",
      },
      {
        patterns: [/\b(cancel|cancellation|subscription|membership)\b/i],
        reply: "I can help with that. Before I proceed, may I ask what's prompting the cancellation? We may be able to address the issue or offer an alternative.",
      },
    ],
    fallbacks: [
      "I want to make sure I help you correctly. Could you provide a little more detail about the issue?",
      "Thank you for letting me know. I've logged this for our team. Is there anything else I can assist you with today?",
      "That's helpful context. Let me check our system and get back to you with the most accurate information.",
    ],
  },

  appointments: {
    quickPrompts: [
      'Book an appointment tomorrow',
      'Reschedule my appointment',
      'Cancel my booking',
      'What slots are available?',
    ],
    rules: [
      {
        patterns: [/\b(hi|hello|hey)\b/i],
        reply: "Hello! I'm the scheduling assistant. Would you like to book a new appointment, reschedule an existing one, or cancel a booking?",
      },
      {
        patterns: [/\b(book|schedule|appointment|slot|meeting|session)\b/i],
        reply: "I'd be happy to book that for you! What's the reason for your visit, and do you have a preferred date and time in mind?",
      },
      {
        patterns: [/\b(tomorrow|next week|monday|tuesday|wednesday|thursday|friday|morning|afternoon|evening)\b/i],
        reply: "Let me check availability for that time. I have openings at 10:00 AM, 1:30 PM, and 4:00 PM. Which slot works best for you?",
      },
      {
        patterns: [/\b(reschedule|change|move|different (day|time|date))\b/i],
        reply: "Of course! Could you confirm your current booking reference or the original date/time of your appointment? I'll find you an alternative slot.",
      },
      {
        patterns: [/\b(cancel|cancellation|remove)\b/i],
        reply: "I can cancel that for you. Could you share your booking reference or the date of the appointment you'd like to cancel? We do ask for 24 hours notice where possible.",
      },
      {
        patterns: [/\b(available|availability|open|free|when can|earliest)\b/i],
        reply: "Looking at the calendar now — our earliest available slot is tomorrow at 10:00 AM, followed by Wednesday at 2:00 PM. Would either of those work?",
      },
      {
        patterns: [/\b(confirm|confirmed|yes|yeah|sure|perfect|great)\b/i],
        reply: "Wonderful! I've confirmed your appointment. You'll receive a confirmation via SMS and email shortly. Is there anything else you need before your visit?",
      },
    ],
    fallbacks: [
      "Certainly! To find the best slot for you — do you have a preference for morning or afternoon appointments?",
      "Let me check the calendar. Could you share any dates or times that definitely won't work for you?",
      "Got it. Your appointment details have been noted. What else can I help you with?",
    ],
  },
};

/* ─── Generic fallbacks for unknown templates ─────────────────────────── */
const GENERIC_FALLBACKS = [
  "That's a great question! Let me help you with that.",
  "I understand. Could you tell me a bit more so I can assist you better?",
  "Thank you for sharing that. I'm here to help — what would you like to do next?",
];

/* ─── Public API ─────────────────────────────────────────────────────── */

export function getQuickPrompts(templateId: string): string[] {
  return MOCKS[templateId]?.quickPrompts ?? [
    'Tell me more',
    'How does this work?',
    'I need help',
    'What can you do?',
  ];
}

/**
 * Returns a mock AI reply for the given user message and template.
 * Simulates realistic 400-900ms latency via the returned promise.
 */
export async function getMockReply(
  userMessage: string,
  templateId: string,
  conversationLength: number,
): Promise<string> {
  const delay = 500 + Math.random() * 700;
  await new Promise((r) => setTimeout(r, delay));

  const mocks = MOCKS[templateId];
  if (!mocks) {
    return GENERIC_FALLBACKS[conversationLength % GENERIC_FALLBACKS.length];
  }

  const lower = userMessage.toLowerCase();
  for (const rule of mocks.rules) {
    for (const pattern of rule.patterns) {
      const m = lower.match(pattern);
      if (m) {
        return typeof rule.reply === 'function' ? rule.reply(m) : rule.reply;
      }
    }
  }

  return mocks.fallbacks[conversationLength % mocks.fallbacks.length];
}
