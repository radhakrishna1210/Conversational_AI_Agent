export type SolutionIconKey =
  | 'bar-chart'
  | 'bell'
  | 'calendar'
  | 'calendar-check'
  | 'check-circle'
  | 'clock'
  | 'credit-card'
  | 'headphones'
  | 'life-buoy'
  | 'message-circle'
  | 'messages'
  | 'phone-call'
  | 'refresh'
  | 'scale'
  | 'shield'
  | 'sparkles'
  | 'user-check'
  | 'wallet';

export type SolutionUseCaseContent = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  benefits: Array<{
    title: string;
    description: string;
    icon: SolutionIconKey;
  }>;
  templates: string[];
  features: Array<{
    title: string;
    description: string;
    points: string[];
    icon: SolutionIconKey;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  cta: {
    title: string;
    description: string;
    primaryLabel: string;
    secondaryLabel: string;
  };
};

export const solutionUseCases = {
  collections: {
    slug: 'collections',
    eyebrow: 'Collections Voice AI Solutions',
    title: 'Automate Payment Collections',
    description:
      'Automate payment reminders and collections with AI. Improve cash flow while keeping conversations respectful, consistent, and easy to track.',
    benefits: [
      {
        title: 'Smart Call Management',
        description: 'Handle multiple payment reminder calls simultaneously, around the clock.',
        icon: 'phone-call',
      },
      {
        title: 'Payment Follow-Ups',
        description: 'Send timely reminders and guide customers toward verified payment links.',
        icon: 'credit-card',
      },
      {
        title: 'Flexible Payment Plans',
        description: 'Discuss payment arrangements while preserving customer relationships.',
        icon: 'wallet',
      },
    ],
    templates: [
      'Payment Reminders & Recovery',
      'Renewal Reminder Agent',
      'Follow-Up Care Calls',
      'Review Requests',
    ],
    features: [
      {
        title: 'Automated Payment Reminders',
        description:
          'Your assistant reminds customers about upcoming and overdue payments, follows up consistently, and keeps payment status current.',
        points: ['Timely reminders', 'Consistent follow-up', 'Due date tracking', 'Multi-channel outreach'],
        icon: 'bell',
      },
      {
        title: 'Smart Call Management',
        description:
          'Optimize call timing, record communication history, and maintain detailed account notes for every customer interaction.',
        points: ['Optimal timing', 'Detailed logging', 'History tracking', 'Account insights'],
        icon: 'bar-chart',
      },
      {
        title: 'Payment Plan Conversations',
        description:
          'Guide customers through structured payment options and capture commitments without adding manual work for your team.',
        points: ['Plan options', 'Promise-to-pay capture', 'Escalation rules', 'CRM-ready notes'],
        icon: 'calendar-check',
      },
    ],
    faqs: [
      {
        question: 'How can OmniDimension help with payment reminders?',
        answer:
          'You can create a voice assistant that reminds customers about upcoming or overdue payments, follows up on invoices, and updates payment status for your team.',
      },
      {
        question: 'Can I customize how the assistant talks about payments?',
        answer:
          'Yes. You can define the assistant tone, language, and conversation style, from firm and professional to polite and empathetic.',
      },
      {
        question: 'Can my assistant collect payments over the call?',
        answer:
          'The assistant can guide customers toward secure payment completion by sending verified links through channels such as SMS or email.',
      },
      {
        question: 'Can I track how my payment assistant is performing?',
        answer:
          'Yes. You can monitor calls, outcomes, customer interactions, and collection performance from your OmniDimension dashboard.',
      },
    ],
    cta: {
      title: 'Start collecting with a smarter voice workflow',
      description:
        'Launch a collections assistant that follows up consistently, documents every call, and helps your team focus on higher-value accounts.',
      primaryLabel: 'Create Free Agent',
      secondaryLabel: 'Book a Demo',
    },
  },
  negotiation: {
    slug: 'negotiation',
    eyebrow: 'Negotiation Voice AI Solutions',
    title: 'Automate Customer Negotiations',
    description:
      'Use AI voice assistants to handle structured negotiations, respond to objections, and guide conversations toward clear next steps.',
    benefits: [
      {
        title: 'Objection Handling',
        description: 'Respond to common objections with consistent, approved talking points.',
        icon: 'message-circle',
      },
      {
        title: 'Structured Offers',
        description: 'Present eligible offers, concessions, or terms based on your rules.',
        icon: 'scale',
      },
      {
        title: 'Outcome Tracking',
        description: 'Capture accepted terms, declined offers, and follow-up needs automatically.',
        icon: 'check-circle',
      },
    ],
    templates: ['Payment Plan Negotiator', 'Sales Objection Handler', 'Renewal Save Agent', 'Settlement Follow-Up'],
    features: [
      {
        title: 'Guided Conversation Flows',
        description:
          'Keep negotiations on track with structured prompts, compliant language, and clear escalation paths for sensitive moments.',
        points: ['Approved scripts', 'Fallback handling', 'Escalation triggers', 'Tone controls'],
        icon: 'messages',
      },
      {
        title: 'Rule-Based Offer Logic',
        description:
          'Configure what the assistant can offer, when it can offer it, and which customer responses require human review.',
        points: ['Offer guardrails', 'Eligibility checks', 'Term capture', 'Human handoff'],
        icon: 'scale',
      },
      {
        title: 'Negotiation Insights',
        description:
          'Review objections, accepted terms, and conversion patterns to improve scripts and business outcomes over time.',
        points: ['Objection trends', 'Accepted terms', 'Call summaries', 'Performance reporting'],
        icon: 'bar-chart',
      },
    ],
    faqs: [
      {
        question: 'What types of negotiations can a voice assistant handle?',
        answer:
          'It can handle structured conversations such as payment plans, renewals, discounts, save offers, and follow-up terms within rules you define.',
      },
      {
        question: 'Can I control what offers the assistant is allowed to make?',
        answer:
          'Yes. You can define guardrails, eligible offers, escalation conditions, and fallback responses before the assistant goes live.',
      },
      {
        question: 'What happens when a customer asks for something unusual?',
        answer:
          'The assistant can ask clarifying questions, capture the request, and escalate the conversation to your team when it falls outside approved rules.',
      },
      {
        question: 'Can I review negotiation outcomes?',
        answer:
          'Yes. You can review summaries, outcomes, objections, and follow-up needs so your team can act on every conversation.',
      },
    ],
    cta: {
      title: 'Turn repeat negotiations into a reliable workflow',
      description:
        'Create a voice assistant that keeps conversations consistent, captures terms clearly, and knows when to escalate.',
      primaryLabel: 'Create Free Agent',
      secondaryLabel: 'Book a Demo',
    },
  },
  customerSupport: {
    slug: 'customer-support',
    eyebrow: 'Customer Support Voice AI Solutions',
    title: 'Scale Customer Support With Voice AI',
    description:
      'Resolve common questions, collect context, and route complex issues to the right team with always-on AI phone support.',
    benefits: [
      {
        title: '24/7 Coverage',
        description: 'Answer support calls even when your team is offline or at capacity.',
        icon: 'headphones',
      },
      {
        title: 'Fast Issue Triage',
        description: 'Collect customer context and classify requests before escalation.',
        icon: 'life-buoy',
      },
      {
        title: 'Human Handoff',
        description: 'Transfer priority issues with summaries and next-step context.',
        icon: 'user-check',
      },
    ],
    templates: ['Support FAQ Agent', 'Order Status Assistant', 'Technical Triage Agent', 'Escalation Intake Agent'],
    features: [
      {
        title: 'Instant FAQ Resolution',
        description:
          'Give customers fast answers to common questions using your knowledge base, policy docs, and support scripts.',
        points: ['Knowledge base answers', 'Policy guidance', 'Consistent responses', 'Lower wait times'],
        icon: 'sparkles',
      },
      {
        title: 'Issue Triage and Routing',
        description:
          'Gather issue details, identify urgency, and route customers to the right team or workflow with clean context.',
        points: ['Intent capture', 'Priority detection', 'Smart routing', 'Case summaries'],
        icon: 'life-buoy',
      },
      {
        title: 'Support Analytics',
        description:
          'Track common questions, escalation reasons, call outcomes, and customer sentiment to improve support operations.',
        points: ['Topic trends', 'Resolution rates', 'Sentiment signals', 'Team insights'],
        icon: 'bar-chart',
      },
    ],
    faqs: [
      {
        question: 'Can the assistant answer customer support questions?',
        answer:
          'Yes. You can train it on FAQs, policies, product information, and support workflows so it can answer common questions consistently.',
      },
      {
        question: 'Can it transfer customers to a human agent?',
        answer:
          'Yes. The assistant can escalate calls based on urgency, customer request, topic, or any rule you configure.',
      },
      {
        question: 'Can it create support tickets?',
        answer:
          'The assistant can collect issue details and send structured summaries into your support workflow through integrations or API connections.',
      },
      {
        question: 'How does it help during high-volume periods?',
        answer:
          'It can answer repetitive questions, collect context, and prioritize escalations so your human team can focus on complex cases.',
      },
    ],
    cta: {
      title: 'Give every caller a faster first response',
      description:
        'Launch a support assistant that resolves routine questions, captures context, and keeps your team focused on complex work.',
      primaryLabel: 'Create Free Agent',
      secondaryLabel: 'Book a Demo',
    },
  },
  appointments: {
    slug: 'appointments',
    eyebrow: 'Appointments Voice AI Solutions',
    title: 'Automate Appointment Scheduling',
    description:
      'Let customers book, confirm, reschedule, and receive reminders through natural AI voice conversations.',
    benefits: [
      {
        title: 'Calendar Booking',
        description: 'Schedule appointments directly into your connected calendar workflow.',
        icon: 'calendar',
      },
      {
        title: 'Reminders and Confirmations',
        description: 'Reduce no-shows with automated confirmations and timely reminders.',
        icon: 'bell',
      },
      {
        title: 'Rescheduling Support',
        description: 'Handle changes without creating back-and-forth work for your team.',
        icon: 'refresh',
      },
    ],
    templates: ['Clinic Appointment Booker', 'Demo Scheduling Agent', 'Salon Booking Assistant', 'Service Reminder Agent'],
    features: [
      {
        title: 'Automated Booking',
        description:
          'Collect customer details, find suitable times, and guide callers through booking without manual coordination.',
        points: ['Availability checks', 'Customer details', 'Calendar sync', 'Booking confirmation'],
        icon: 'calendar-check',
      },
      {
        title: 'No-Show Reduction',
        description:
          'Send reminders, confirm attendance, and follow up with customers who need to reschedule.',
        points: ['Call reminders', 'Confirmations', 'Reschedule prompts', 'Attendance tracking'],
        icon: 'clock',
      },
      {
        title: 'Operational Visibility',
        description:
          'Track booked appointments, missed calls, reschedules, and common scheduling requests from one workflow.',
        points: ['Booking logs', 'Missed-call recovery', 'Reschedule history', 'Volume insights'],
        icon: 'bar-chart',
      },
    ],
    faqs: [
      {
        question: 'Can the assistant book appointments automatically?',
        answer:
          'Yes. It can collect caller details, check available times through your workflow, and confirm appointments during the call.',
      },
      {
        question: 'Can it handle rescheduling?',
        answer:
          'Yes. The assistant can help callers change appointment times, capture the reason, and confirm the updated booking.',
      },
      {
        question: 'Can it send reminders?',
        answer:
          'Yes. You can use the assistant for confirmation calls, reminder calls, and follow-ups for missed or upcoming appointments.',
      },
      {
        question: 'Which businesses can use appointment automation?',
        answer:
          'Healthcare clinics, salons, real estate teams, service businesses, sales teams, and any organization that books time with customers can use it.',
      },
    ],
    cta: {
      title: 'Keep your calendar full without manual scheduling',
      description:
        'Create an appointment assistant that books, confirms, and reschedules calls while your team stays focused.',
      primaryLabel: 'Create Free Agent',
      secondaryLabel: 'Book a Demo',
    },
  },
} satisfies Record<string, SolutionUseCaseContent>;
