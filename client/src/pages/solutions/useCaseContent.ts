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
    templatePrompt?: string;
    featureHeading?: string;
    featureDescription?: string;
    faqHeading?: string;
    faqDescription?: string;
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
        'Automate payment reminders and collections with AI. Improve cash flow while maintaining positive customer relationships.',
      benefits: [
        {
          title: 'Smart Call Management',
          description: 'Handle multiple payment reminder calls simultaneously, 24/7.',
          icon: 'phone-call',
        },
        {
          title: 'Payment Processing',
          description: 'Securely collect payments over the phone with PCI-aware workflows.',
          icon: 'credit-card',
        },
        {
          title: 'Flexible Payment Plans',
          description: 'Negotiate and set up custom payment arrangements automatically.',
          icon: 'wallet',
        },
      ],
      templatePrompt:
        'Example: Create an AI agent that makes professional payment reminder calls to customers with overdue accounts, offers payment plans, processes payments over the phone, and maintains positive customer relationships...',
      templates: [
        'Payment Reminders & Recovery',
        'Renewal Reminder Agent',
        'Follow-Up Care Calls',
        'Review Requests',
      ],
      featureHeading: 'Built for the way your team works',
      featureDescription: 'Improve cash flow while maintaining customer relationships.',
      features: [
        {
          title: 'Automated Payment Reminders',
          description:
            'Your assistant sends automated reminders for upcoming and overdue payments, following up consistently to improve collection rates and cash flow.',
          points: ['Timely reminders', 'Consistent follow-up', 'Due date tracking', 'Multi-channel outreach'],
          icon: 'calendar',
        },
        {
          title: 'Smart Call Management',
          description:
            'Your assistant optimizes call timing, tracks communication history, and maintains detailed logs of all interactions for better account management.',
          points: ['Optimal timing', 'Detailed logging', 'History tracking', 'Account insights'],
          icon: 'clock',
        },
        {
          title: 'Secure Payment Processing',
          description:
            'Guide customers through payment completion using approved payment paths while keeping sensitive details handled through secure channels.',
          points: ['Secure links', 'Payment status', 'PCI-aware flow', 'Receipt follow-up'],
          icon: 'credit-card',
        },
      ],
      faqHeading: 'Frequently Asked Questions',
      faqDescription: 'Common questions about collections AI',
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
        'Automate structured negotiation calls with AI. Handle objections, offer approved terms, and move customers toward clear next steps.',
      benefits: [
        {
          title: 'Objection Handling',
          description: 'Respond to common objections with consistent, approved language.',
          icon: 'message-circle',
        },
        {
          title: 'Offer Guardrails',
          description: 'Present discounts, plans, or terms only when they match your rules.',
          icon: 'scale',
        },
        {
          title: 'Outcome Tracking',
          description: 'Capture accepted terms, declined offers, and follow-up actions automatically.',
          icon: 'check-circle',
        },
      ],
      templatePrompt:
        'Example: Create an AI agent that negotiates payment plans and settlement options with customers, handles objections politely, follows approved offer rules, escalates exceptions, and records the final outcome...',
      templates: [
        'Payment Plan Negotiator',
        'Sales Objection Handler',
        'Renewal Save Agent',
        'Settlement Follow-Up',
      ],
      featureHeading: 'Built for consistent negotiation workflows',
      featureDescription: 'Keep customer conversations structured, compliant, and outcome-focused.',
      features: [
        {
          title: 'Guided Negotiation Flows',
          description:
            'Your assistant keeps negotiations on track with structured prompts, approved language, and clear escalation paths for sensitive moments.',
          points: ['Approved scripts', 'Fallback handling', 'Escalation triggers', 'Tone controls'],
          icon: 'messages',
        },
        {
          title: 'Rule-Based Offer Logic',
          description:
            'Configure what the assistant can offer, when it can offer it, and which customer responses need human review.',
          points: ['Offer guardrails', 'Eligibility checks', 'Term capture', 'Human handoff'],
          icon: 'scale',
        },
        {
          title: 'Negotiation Insights',
          description:
            'Review objections, accepted terms, declined offers, and conversion patterns to improve scripts and outcomes over time.',
          points: ['Objection trends', 'Accepted terms', 'Call summaries', 'Performance reporting'],
          icon: 'bar-chart',
        },
      ],
      faqHeading: 'Frequently Asked Questions',
      faqDescription: 'Common questions about negotiation AI',
      faqs: [
        {
          question: 'How can OmniDimension help with customer negotiations?',
          answer:
            'You can create a voice assistant that handles structured negotiations, presents approved options, responds to common objections, and documents the outcome for your team.',
        },
        {
          question: 'Can I control what offers the assistant is allowed to make?',
          answer:
            'Yes. You can define guardrails, eligible offers, escalation conditions, and fallback responses before the assistant goes live.',
        },
        {
          question: 'What happens when a customer asks for something unusual?',
          answer:
            'The assistant can ask clarifying questions, capture the request, and escalate the call to your team when it falls outside approved rules.',
        },
        {
          question: 'Can I review negotiation outcomes?',
          answer:
            'Yes. You can review summaries, outcomes, objections, and follow-up needs so your team can act on every conversation.',
        },
      ],
      cta: {
        title: 'Turn repeat negotiations into a reliable voice workflow',
        description:
          'Launch a negotiation assistant that keeps conversations consistent, captures terms clearly, and knows when to escalate.',
        primaryLabel: 'Create Free Agent',
        secondaryLabel: 'Book a Demo',
      },
    },
    customerSupport: {
      slug: 'customer-support',
      eyebrow: 'Customer Support Voice AI Solutions',
      title: 'Scale Customer Support With Voice AI',
      description:
        'Automate customer support calls with AI. Resolve common questions, collect context, and route complex issues to the right team.',
      benefits: [
        {
          title: '24/7 Coverage',
          description: 'Answer support calls even when your team is offline or at capacity.',
          icon: 'headphones',
        },
        {
          title: 'Fast Issue Triage',
          description: 'Collect caller context and classify requests before escalation.',
          icon: 'life-buoy',
        },
        {
          title: 'Human Handoff',
          description: 'Transfer priority issues with summaries and next-step context.',
          icon: 'user-check',
        },
      ],
      templatePrompt:
        'Example: Create an AI agent that answers customer support calls, resolves common FAQs, checks order or account status, gathers issue details, escalates priority cases, and sends a summary to the support team...',
      templates: [
        'Support FAQ Agent',
        'Order Status Assistant',
        'Technical Triage Agent',
        'Escalation Intake Agent',
      ],
      featureHeading: 'Built for always-on support operations',
      featureDescription: 'Resolve routine calls faster while giving your team cleaner context.',
      features: [
        {
          title: 'Instant FAQ Resolution',
          description:
            'Your assistant gives customers fast answers to common questions using your knowledge base, policy docs, and support scripts.',
          points: ['Knowledge base answers', 'Policy guidance', 'Consistent responses', 'Lower wait times'],
          icon: 'sparkles',
        },
        {
          title: 'Issue Triage and Routing',
          description:
            'Gather issue details, identify urgency, and route customers to the right team or workflow with clean call context.',
          points: ['Intent capture', 'Priority detection', 'Smart routing', 'Case summaries'],
          icon: 'life-buoy',
        },
        {
          title: 'Support Analytics',
          description:
            'Track common questions, escalation reasons, call outcomes, and customer sentiment to improve support operations over time.',
          points: ['Topic trends', 'Resolution rates', 'Sentiment signals', 'Team insights'],
          icon: 'bar-chart',
        },
      ],
      faqHeading: 'Frequently Asked Questions',
      faqDescription: 'Common questions about customer support AI',
      faqs: [
        {
          question: 'How can OmniDimension help with customer support?',
          answer:
            'You can create a voice assistant that answers routine questions, collects issue details, summarizes calls, and routes complex requests to your team.',
        },
        {
          question: 'Can it transfer customers to a human agent?',
          answer:
            'Yes. The assistant can escalate calls based on urgency, customer request, topic, or any rule you configure.',
        },
        {
          question: 'Can it create support tickets?',
          answer:
            'The assistant can collect issue details and send structured summaries into your support workflow through integrations or API connections you configure.',
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
          'Launch a support assistant that resolves routine questions, captures context, and keeps your team focused on higher-priority cases.',
        primaryLabel: 'Create Free Agent',
        secondaryLabel: 'Book a Demo',
      },
    },
    appointments: {
      slug: 'appointments',
      eyebrow: 'Appointments Voice AI Solutions',
      title: 'Automate Appointment Scheduling',
      description:
        'Automate appointment booking with AI. Let customers schedule, confirm, reschedule, and receive reminders through natural voice conversations.',
      benefits: [
        {
          title: 'Calendar Booking',
          description: 'Schedule appointments directly through your connected calendar workflow.',
          icon: 'calendar',
        },
        {
          title: 'Confirmations and Reminders',
          description: 'Reduce no-shows with automated confirmations and timely reminders.',
          icon: 'bell',
        },
        {
          title: 'Rescheduling Support',
          description: 'Handle changes without creating back-and-forth work for your team.',
          icon: 'refresh',
        },
      ],
      templatePrompt:
        'Example: Create an AI agent that answers appointment calls, checks availability, books time slots, confirms customer details, sends reminders, handles rescheduling, and updates the calendar automatically...',
      templates: [
        'Clinic Appointment Booker',
        'Demo Scheduling Agent',
        'Salon Booking Assistant',
        'Service Reminder Agent',
      ],
      featureHeading: 'Built for scheduling teams and service workflows',
      featureDescription: 'Keep calendars organized while reducing manual back-and-forth.',
      features: [
        {
          title: 'Automated Booking',
          description:
            'Your assistant collects customer details, finds suitable times, and guides callers through booking without manual coordination.',
          points: ['Availability checks', 'Customer details', 'Calendar sync', 'Booking confirmation'],
          icon: 'calendar-check',
        },
        {
          title: 'No-Show Reduction',
          description:
            'Send reminders, confirm attendance, and follow up with customers who need to reschedule before the appointment.',
          points: ['Call reminders', 'Confirmations', 'Reschedule prompts', 'Attendance tracking'],
          icon: 'clock',
        },
        {
          title: 'Operational Visibility',
          description:
            'Track booked appointments, missed calls, reschedules, and common scheduling requests from one voice workflow.',
          points: ['Booking logs', 'Missed-call recovery', 'Reschedule history', 'Volume insights'],
          icon: 'bar-chart',
        },
      ],
      faqHeading: 'Frequently Asked Questions',
      faqDescription: 'Common questions about appointment AI',
      faqs: [
        {
          question: 'How can OmniDimension help with appointment scheduling?',
          answer:
            'You can create a voice assistant that collects caller details, checks available times through your workflow, and confirms appointments during the call.',
        },
        {
          question: 'Can it handle rescheduling?',
          answer:
            'Yes. The assistant can help callers change appointment times, capture the reason, and confirm the updated booking.',
        },
        {
          question: 'Can it send reminders?',
          answer:
            'Yes. You can use the assistant for confirmation calls, reminder calls, and follow-ups for missed, changed, or upcoming appointments.',
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
          'Launch an appointment assistant that books, confirms, and reschedules calls while your team stays focused.',
        primaryLabel: 'Create Free Agent',
        secondaryLabel: 'Book a Demo',
      },
    },
  } satisfies Record<string, SolutionUseCaseContent>;

// ── Vertical pages (Real Estate, Healthcare) ─────────────────────────────────
export const verticalUseCases = {
  realEstate: {
    slug: 'real-estate',
    eyebrow: 'Real Estate Voice AI Solutions',
    title: 'Transform Your Real Estate Business with Voice AI',
    description:
      'Never miss a lead again. AI agents handle property inquiries, schedule site visits, and qualify buyers 24/7 while you focus on closing deals.',
    benefits: [
      {
        title: 'Property Inquiries',
        description: 'Handle property questions, schedule viewings, and qualify buyers instantly.',
        icon: 'phone-call' as const,
      },
      {
        title: 'Site Visit Booking',
        description: 'Automatically schedule property tours and manage availability.',
        icon: 'calendar' as const,
      },
      {
        title: 'Lead Qualification',
        description: 'Pre-qualify buyers based on budget, timeline, and requirements.',
        icon: 'user-check' as const,
      },
    ],
    templatePrompt:
      'Example: Create a friendly real estate assistant that handles property inquiries, schedules site visits, and qualifies buyers based on their budget and timeline...',
    templates: [
      'Property Inquiry Handler',
      'Site Visit Booking Agent',
      'Lead Follow-Up Agent',
      'Listing Update Calls',
    ],
    featureHeading: 'Real Estate Voice Solution',
    featureDescription: 'Handle inquiries, qualify leads, and schedule property viewings.',
    features: [
      {
        title: 'Property Information on Demand',
        description:
          'Your assistant answers detailed questions about any listing instantly. Price, square footage, bedrooms, amenities — prospects get answers immediately.',
        points: ['Listing details', 'Neighborhood info', 'Price updates', 'Amenity details'],
        icon: 'phone-call' as const,
      },
      {
        title: 'Automatic Scheduling',
        description:
          'Let prospects book property viewings directly. No back-and-forth emails or phone tag.',
        points: ['Self-service booking', 'Calendar integration', 'Automatic reminders', 'Easy rescheduling'],
        icon: 'calendar' as const,
      },
      {
        title: 'Finds Serious Buyers',
        description:
          'Your assistant asks the right questions to identify qualified buyers before they reach you.',
        points: ['Budget matching', 'Timeline filtering', 'Need assessment', 'CRM sync'],
        icon: 'user-check' as const,
      },
    ],
    faqHeading: 'Frequently Asked Questions',
    faqDescription: 'Common questions about the real estate voice solution.',
    faqs: [
      {
        question: 'How can OmniDimension help with property inquiries?',
        answer:
          'You can create a voice assistant that answers questions about listings, pricing, availability, and nearby amenities — instantly qualifying leads based on budget and preferences.',
      },
      {
        question: 'Can my assistant schedule property visits automatically?',
        answer:
          'Yes. You can enable calendar integration so your assistant checks available slots, confirms appointments, and sends reminders to both agents and clients.',
      },
      {
        question: 'How does the assistant qualify leads?',
        answer:
          'You define how it asks about budget, location, and timeline. It filters serious buyers automatically and syncs qualified leads directly to your CRM.',
      },
      {
        question: 'Can it integrate with our CRM or lead systems?',
        answer:
          'Yes. OmniDimension connects with Salesforce, HubSpot, Zoho CRM, and many other platforms.',
      },
      {
        question: 'Does it support multiple languages for clients?',
        answer:
          'Yes. The assistant supports more than 50 languages and can automatically adapt to customer preferences.',
      },
    ],
    cta: {
      title: 'Turn every property inquiry into a qualified lead',
      description:
        'Launch a real estate assistant that handles inquiries, books viewings, and qualifies buyers around the clock.',
      primaryLabel: 'Create Free Agent',
      secondaryLabel: 'Book a Demo',
    },
  },
  healthcare: {
    slug: 'healthcare',
    eyebrow: 'Healthcare Voice AI Solutions',
    title: 'Transform Healthcare with Voice AI',
    description:
      'Never miss an appointment call again. AI-powered voice assistant that schedules, reschedules, and sends reminders 24/7 while maintaining HIPAA compliance.',
    benefits: [
      {
        title: 'Appointment Scheduling',
        description: 'Schedule, reschedule, and manage appointments automatically with calendar integration.',
        icon: 'calendar' as const,
      },
      {
        title: 'Automated Reminders',
        description: 'Send appointment reminders via SMS, email, or voice to reduce no-shows.',
        icon: 'bell' as const,
      },
      {
        title: '24/7 Availability',
        description: 'Answer calls and book appointments even after hours.',
        icon: 'clock' as const,
      },
    ],
    templatePrompt:
      'Example: Create a compassionate healthcare assistant that schedules patient appointments, sends medication reminders, and provides basic health information while maintaining HIPAA compliance...',
    templates: [
      'Appointment Booking Agent',
      'Prescription Refill Handler',
      'Appointment Reminder Calls',
      'Follow-Up Care Calls',
    ],
    featureHeading: 'Healthcare Voice Solution',
    featureDescription: 'Schedule appointments, handle prescription refills, and patient support.',
    features: [
      {
        title: 'Easy Appointment Booking',
        description:
          'Patients can book, reschedule, or cancel appointments by phone anytime, automatically.',
        points: ['Real-time availability', 'Self-service booking', 'Calendar sync', 'Instant confirmation'],
        icon: 'calendar-check' as const,
      },
      {
        title: 'Automatic Reminders',
        description: 'Reduce no-shows with automatic appointment reminders sent before each visit.',
        points: ['Call reminders', 'Text reminders', 'Customizable timing', 'Reduces no-shows'],
        icon: 'bell' as const,
      },
      {
        title: 'Patient Support',
        description:
          'Answer common questions, prescription refills, and follow-up scheduling automatically.',
        points: ['Common questions', 'Prescription refills', 'Follow-up calls', '24/7 support'],
        icon: 'headphones' as const,
      },
    ],
    faqHeading: 'Frequently Asked Questions',
    faqDescription: 'Common questions about healthcare voice AI.',
    faqs: [
      {
        question: 'How can OmniDimension help with appointment scheduling?',
        answer:
          'You can create a voice assistant that answers patient calls 24/7, checks your calendar in real time, suggests available time slots, and books appointments instantly.',
      },
      {
        question: 'Can patients reschedule or cancel appointments?',
        answer:
          'Yes. You can enable rescheduling and cancellation options so patients can update their appointments anytime. The assistant syncs changes automatically and sends confirmations.',
      },
      {
        question: 'Can it handle multiple doctors or clinic locations?',
        answer:
          'Yes. You can configure your assistant to manage calendars for multiple providers, departments, or branches.',
      },
      {
        question: 'Does it send appointment reminders?',
        answer:
          'Yes. The assistant can send reminders through SMS, email, or automated calls at intervals you set — helping reduce no-shows.',
      },
      {
        question: 'Can it integrate with our existing calendar or EMR system?',
        answer:
          'Yes. OmniDimension connects with tools like Google Calendar, Outlook, and popular EMR systems.',
      },
    ],
    cta: {
      title: 'Give every patient a faster, more reliable experience',
      description:
        'Launch a healthcare assistant that books appointments, sends reminders, and handles common patient questions automatically.',
      primaryLabel: 'Create Free Agent',
      secondaryLabel: 'Book a Demo',
    },
  },
} satisfies Record<string, SolutionUseCaseContent>;
