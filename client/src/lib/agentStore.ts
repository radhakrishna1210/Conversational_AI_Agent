export interface FlowItem {
  id: string;
  title: string;
  enabled: boolean;
  body?: string;
}
 

export interface AgentConfig {
  id: string;
  name: string;
  language: string;
  llm: string;
  voice: string;
  kbFiles: number;
  search: string;
  postCall: string;
  integrations: string;
  welcomeMessage: string;
  selectedLanguages: string[];
  flowItems: FlowItem[];
  maxDuration: number;
  silenceTimeout: number;
  dynamicEnabled: boolean;
  interruptibleEnabled: boolean;
  aiModel: string;
  transcription: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'voice_ai_agents_v1';

const defaultAgent: AgentConfig = {
  id: '131000',
  name: 'Outbound Lead Qualification Agent',
  language: 'English (India)',
  llm: 'GPT-4.1-Mini',
  voice: 'Google - Aoede (female)',
  kbFiles: 0,
  search: 'Off',
  postCall: 'None',
  integrations: 'None',
  welcomeMessage: 'Hello, I am calling from our sales team to follow up on your interest in our services. Am I speaking with the business owner or decision maker?',
  selectedLanguages: ['English (Indian)'],
  flowItems: [
    {
      id: '1',
      title: 'Agent Identity & Purpose',
      enabled: true,
      body: `AGENT GLOBAL INSTRUCTIONS\n# PERSONA\n- The agent is a professional and polite outbound lead qualification assistant.\n- Speak in a friendly, enthusiastic, and confident tone.\n\n# RESPONSE GENERATION GUIDELINES\n- Keep responses brief and user-focused.\n- Guide the user through the qualification questions efficiently.`
    },
    {
      id: '2',
      title: 'Interest Verification Flow',
      enabled: true,
      body: `INTEREST VERIFICATION\n- Verify if the contact is interested in our services and ask qualifying questions.\n\nExample response:\nI am calling to see if you are still looking for a solution to help manage your sales team. Are you currently the decision maker for software purchases?`
    },
    {
      id: '3',
      title: 'Lead Qualification Flow',
      enabled: true,
      body: `LEAD QUALIFICATION\n- Ask about their current challenges, team size, and timeline.\n- Take notes on their responses.`
    },
    {
      id: '4',
      title: 'Out of Scope Handling',
      enabled: true,
      body: `# OUT OF SCOPE HANDLING\n- If they ask unrelated questions or technical support questions, politely steer them back to scheduling a demo.\n\nExample response:\nThat's a great question, but I'm primarily here to see if we'd be a good fit and schedule a call with a specialist. Would you like to set up a time for a demo?`
    },
    {
      id: '5',
      title: 'Next Steps & Scheduling',
      enabled: true,
      body: `NEXT STEPS & SCHEDULING\n- Offer to schedule a meeting or demo with an account executive.\n- Confirm the date and time.`
    }
  ],
  maxDuration: 30,
  silenceTimeout: 5,
  dynamicEnabled: true,
  interruptibleEnabled: true,
  aiModel: 'GPT-4.1-Mini',
  transcription: 'Azure',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export function loadAgents(): AgentConfig[] {
  if (typeof window === 'undefined') return [defaultAgent];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultAgent]));
      return [defaultAgent];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (_error) {
    // ignore parsing failures
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultAgent]));
  return [defaultAgent];
}

export function saveAgents(agents: AgentConfig[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function getAgent(agentId: string | undefined): AgentConfig | undefined {
  if (!agentId) return undefined;
  return loadAgents().find(agent => agent.id === agentId);
}

export function saveAgent(agent: AgentConfig) {
  const agents = loadAgents();
  const existingIndex = agents.findIndex(item => item.id === agent.id);
  const updatedAgent = { ...agent, updatedAt: new Date().toISOString() };
  if (existingIndex >= 0) {
    agents[existingIndex] = updatedAgent;
  } else {
    agents.unshift(updatedAgent);
  }
  saveAgents(agents);
  return updatedAgent;
}

export function getDefaultWelcomeMessage(agentName: string): string {
  const nameLower = agentName.toLowerCase();
  if (nameLower.includes('moon') || nameLower.includes('space') || nameLower.includes('astronomy') || nameLower.includes('luna')) {
    return 'Hello, I am Luna, your Moon Information Assistant. What would you like to know about the Moon?';
  }
  if (nameLower.includes('lead') || nameLower.includes('qualification') || nameLower.includes('outbound') || nameLower.includes('sales')) {
    return 'Hello, I am calling from our sales team to follow up on your interest in our services. Am I speaking with the business owner or decision maker?';
  }
  if (nameLower.includes('support') || nameLower.includes('customer') || nameLower.includes('return') || nameLower.includes('refund') || nameLower.includes('help') || nameLower.includes('billing') || nameLower.includes('service')) {
    return 'Hello, thank you for calling support. I am your customer service assistant. How can I help you with your order or return today?';
  }
  if (nameLower.includes('healthcare') || nameLower.includes('appointment') || nameLower.includes('reminder') || nameLower.includes('booking') || nameLower.includes('doctor') || nameLower.includes('medical') || nameLower.includes('schedule') || nameLower.includes('patient') || nameLower.includes('clinic')) {
    return `Hello, I am your appointment coordinator. I am calling to confirm your upcoming appointment or help you manage your booking. How can I help you today?`;
  }
  return `Hello, I am ${agentName}. How can I help you today?`;
}

export function getDefaultFlowItems(agentName: string): FlowItem[] {
  const nameLower = agentName.toLowerCase();
  
  if (nameLower.includes('moon') || nameLower.includes('space') || nameLower.includes('astronomy') || nameLower.includes('luna')) {
    return [
      {
        id: '1',
        title: 'Agent Identity & Purpose',
        enabled: true,
        body: `AGENT GLOBAL INSTRUCTIONS\n# PERSONA\n- The agent is a virtual space information assistant named Luna.\n- Respond as an educational service for astronomy enthusiasts or curious callers.\n- Speak in a friendly, clear, and enthusiastic tone.\n\n# RESPONSE GENERATION GUIDELINES\n- Keep responses brief and user-focused.\n- Always use simple, non-technical language unless asked for details.\n- Use numbered or bulleted lists for multi-step answers.\n\n# SCOPE\n- Can answer general questions about the Moon's features, history, and exploration.\n- Can share facts and basic science.\n- Cannot provide medical, legal, or financial advice.\n\n# GUARDRAILS\n- Never speculate about unknowns as facts.\n- If asked about unrelated topics, politely redirect and offer to help find resources.`
      },
      {
        id: '2',
        title: 'General Moon Facts Flow',
        enabled: true,
        body: `GENERAL MOON FACTS\n- Respond with an interesting fact if the user asks for information about the Moon.\n\nExample response:\nThe Moon is Earth's only natural satellite and is about one quarter the size of Earth. Would you like to know more?`
      },
      {
        id: '3',
        title: 'Answering Specific Questions Flow',
        enabled: true,
        body: `ANSWERING SPECIFIC QUESTIONS\n- When a user asks a specific question, restate the question briefly then answer with 1–2 facts.\n- If uncertain, say you may be uncertain and offer to look up references.`
      },
      {
        id: '4',
        title: 'Out of Scope Handling',
        enabled: true,
        body: `# OUT OF SCOPE HANDLING\n- Politely redirect if the question is not about the Moon.\n\nExample response:\nI am here to answer questions about the Moon. Would you like to hear a fun fact about it?`
      },
      {
        id: '5',
        title: 'Closing Statement',
        enabled: true,
        body: `CLOSING STATEMENT\n- End calls politely: "Thanks for asking! If you have more questions about the Moon, I'm happy to help."`
      },
      {
        id: '6',
        title: 'Agent Knowledge & Context',
        enabled: true,
        body: `AGENT KNOWLEDGE & CONTEXT\n- Use verified astronomy sources when available.\n- Include short citations when referencing missions or dates (e.g., Apollo 11, 1969).`
      }
    ];
  }
  
  if (nameLower.includes('lead') || nameLower.includes('qualification') || nameLower.includes('outbound') || nameLower.includes('sales')) {
    return [
      {
        id: '1',
        title: 'Agent Identity & Purpose',
        enabled: true,
        body: `AGENT GLOBAL INSTRUCTIONS\n# PERSONA\n- The agent is a professional and polite outbound lead qualification assistant.\n- Speak in a friendly, enthusiastic, and confident tone.\n\n# RESPONSE GENERATION GUIDELINES\n- Keep responses brief and user-focused.\n- Guide the user through the qualification questions efficiently.`
      },
      {
        id: '2',
        title: 'Interest Verification Flow',
        enabled: true,
        body: `INTEREST VERIFICATION\n- Verify if the contact is interested in our services and ask qualifying questions.\n\nExample response:\nI am calling to see if you are still looking for a solution to help manage your sales team. Are you currently the decision maker for software purchases?`
      },
      {
        id: '3',
        title: 'Lead Qualification Flow',
        enabled: true,
        body: `LEAD QUALIFICATION\n- Ask about their current challenges, team size, and timeline.\n- Take notes on their responses.`
      },
      {
        id: '4',
        title: 'Out of Scope Handling',
        enabled: true,
        body: `# OUT OF SCOPE HANDLING\n- If they ask unrelated questions or technical support questions, politely steer them back to scheduling a demo.\n\nExample response:\nThat's a great question, but I'm primarily here to see if we'd be a good fit and schedule a call with a specialist. Would you like to set up a time for a demo?`
      },
      {
        id: '5',
        title: 'Next Steps & Scheduling',
        enabled: true,
        body: `NEXT STEPS & SCHEDULING\n- Offer to schedule a meeting or demo with an account executive.\n- Confirm the date and time.`
      }
    ];
  }
  
  if (nameLower.includes('support') || nameLower.includes('customer') || nameLower.includes('return') || nameLower.includes('refund') || nameLower.includes('help') || nameLower.includes('billing') || nameLower.includes('service')) {
    return [
      {
        id: '1',
        title: 'Agent Identity & Purpose',
        enabled: true,
        body: `AGENT GLOBAL INSTRUCTIONS\n# PERSONA\n- The agent is a helpful and empathetic customer support representative.\n- Respond to inquiries regarding orders, returns, and general support.\n- Speak in a professional, polite, and patient tone.`
      },
      {
        id: '2',
        title: 'Verification & Lookup Flow',
        enabled: true,
        body: `VERIFICATION & LOOKUP\n- Ask the caller for their order ID or account email to look up their details in the system.\n\nExample response:\nI can certainly help you with that. To get started, could you please provide your 6-digit order number?`
      },
      {
        id: '3',
        title: 'Issue Resolution Flow',
        enabled: true,
        body: `ISSUE RESOLUTION\n- Guide the user through the return policy (30-day window, items must be in original condition).\n- Provide clear steps to initiate a return or exchange.`
      },
      {
        id: '4',
        title: 'Out of Scope Handling',
        enabled: true,
        body: `# OUT OF SCOPE HANDLING\n- If the customer asks questions unrelated to their order or company policies, politely guide them back.\n\nExample response:\nI'm here to help with your orders and returns. Is there anything related to your purchase I can assist you with?`
      },
      {
        id: '5',
        title: 'Escalation Handling',
        enabled: true,
        body: `ESCALATION HANDLING\n- If the customer requests a manager or has a complex issue, transfer the call or take down their details for follow-up.`
      }
    ];
  }

  if (nameLower.includes('healthcare') || nameLower.includes('appointment') || nameLower.includes('reminder') || nameLower.includes('booking') || nameLower.includes('doctor') || nameLower.includes('medical') || nameLower.includes('schedule') || nameLower.includes('patient') || nameLower.includes('clinic')) {
    return [
      {
        id: '1',
        title: 'Agent Identity & Purpose',
        enabled: true,
        body: `AGENT GLOBAL INSTRUCTIONS\n# PERSONA\n- The agent is an efficient and caring healthcare scheduling coordinator.\n- Speak in a warm, professional, and clear tone.`
      },
      {
        id: '2',
        title: 'Appointment Details Flow',
        enabled: true,
        body: `APPOINTMENT DETAILS\n- Confirm patient identification (full name and date of birth) before sharing appointment details.\n\nExample response:\nHello! I can look up your appointment details. For confirmation, could you please state your full name and date of birth?`
      },
      {
        id: '3',
        title: 'Rescheduling & Cancellation Flow',
        enabled: true,
        body: `APPOINTMENT RESCHEDULING & CANCELLATION\n- Help patients find an alternative time slot if rescheduling is needed.\n- Process cancellations and confirm the cancellation clearly.`
      },
      {
        id: '4',
        title: 'Out of Scope Handling',
        enabled: true,
        body: `# OUT OF SCOPE HANDLING\n- If the patient asks for medical advice, diagnosis, or prescriptions, politely explain that you cannot provide medical advice.\n\nExample response:\nFor your safety, I cannot provide medical advice or handle clinical questions. Please contact your doctor's office directly, or call 911 if this is a medical emergency.`
      }
    ];
  }

  // Generic fallback
  return [
    {
      id: '1',
      title: 'Agent Identity & Purpose',
      enabled: true,
      body: `AGENT GLOBAL INSTRUCTIONS\n# PERSONA\n- The agent is a professional and helpful virtual assistant.\n- Speak in a friendly, clear, and cooperative tone.`
    },
    {
      id: '2',
      title: 'Information Gathering Flow',
      enabled: true,
      body: `INFORMATION GATHERING\n- Ask clarifying questions to understand the caller's request and provide the most accurate assistance.\n\nExample response:\nI would be happy to help you with that. Could you tell me a bit more about what you are looking for?`
    },
    {
      id: '3',
      title: 'Out of Scope Handling',
      enabled: true,
      body: `# OUT OF SCOPE HANDLING\n- If the caller asks questions outside your capabilities, politely explain your scope and offer to guide them to resources.\n\nExample response:\nI'm sorry, I am not trained to assist with that topic. Is there anything else I can help you with today?`
    }
  ];
}

export function createAgent(name: string): AgentConfig {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : String(Date.now());
  const now = new Date().toISOString();
  const agent: AgentConfig = {
    id,
    name,
    language: 'English (India)',
    llm: 'GPT-4.1-Mini',
    voice: 'Google - Aoede (female)',
    kbFiles: 0,
    search: 'Off',
    postCall: 'None',
    integrations: 'None',
    welcomeMessage: getDefaultWelcomeMessage(name),
    selectedLanguages: ['English (Indian)'],
    flowItems: getDefaultFlowItems(name),
    maxDuration: 30,
    silenceTimeout: 5,
    dynamicEnabled: true,
    interruptibleEnabled: true,
    aiModel: 'GPT-4.1-Mini',
    transcription: 'Azure',
    createdAt: now,
    updatedAt: now
  };
  const agents = loadAgents();
  agents.unshift(agent);
  saveAgents(agents);
  return agent;
}
