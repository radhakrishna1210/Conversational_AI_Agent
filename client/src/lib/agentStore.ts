export interface FlowItem {
  id: string;
  title: string;
  enabled: boolean;
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
  name: 'Moon Information Agent',
  language: 'English (India)',
  llm: 'GPT-4.1-Mini',
  voice: 'Google - Aoede (female)',
  kbFiles: 0,
  search: 'Off',
  postCall: 'None',
  integrations: 'None',
  welcomeMessage: 'Hello, I am Luna, your Moon Information Assistant. What would you like to know about the Moon?',
  selectedLanguages: ['English (Indian)'],
  flowItems: [
    { id: '1', title: 'Agent Identity & Purpose', enabled: true },
    { id: '2', title: 'General Moon Facts Flow', enabled: true }
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
    welcomeMessage: `Hello, I am ${name}. How can I help you today?`,
    selectedLanguages: ['English (Indian)'],
    flowItems: [
      { id: '1', title: 'Agent Identity & Purpose', enabled: true },
      { id: '2', title: 'General Moon Facts Flow', enabled: true }
    ],
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
