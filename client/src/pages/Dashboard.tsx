import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentConfig, deleteAgent, loadAgents, saveAgents, getDefaultFlowItems, getDefaultWelcomeMessage } from '../lib/agentStore';
import { whapi } from '../lib/whapi';


export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const navigate = useNavigate();

  const hardcodedAssistant = {
    name: 'Outbound Lead Qualification Agent',
    language: 'English (India)',
    llm: 'gpt-4.1-mini',
    voice: 'google',
    kbFiles: 0,
    search: 'Off',
    postCall: 'None',
    integrations: 'None',
    id: '131000',
  };

  const normalizeAgent = (agent: Partial<AgentConfig> & { aiModel?: string; languages?: any; flowItems?: any[]; }) : AgentConfig => ({
    id: agent.id ?? String(Date.now()),
    name: agent.name ?? 'New Assistant',
    language: agent.language ?? 'English (India)',
    llm: agent.aiModel ?? agent.llm ?? 'GPT-4.1-Mini',
    voice: agent.voice ?? 'Google - Aoede (female)',
    kbFiles: agent.kbFiles ?? 0,
    search: agent.search ?? 'Off',
    postCall: agent.postCall ?? 'None',
    integrations: agent.integrations ?? 'None',
    welcomeMessage: agent.welcomeMessage ?? getDefaultWelcomeMessage(agent.name ?? 'Assistant'),
    selectedLanguages: Array.isArray(agent.selectedLanguages) ? agent.selectedLanguages : ['English (Indian)'],
    flowItems: Array.isArray(agent.flowItems) ? agent.flowItems : getDefaultFlowItems(agent.name ?? 'Assistant'),
    maxDuration: agent.maxDuration ?? 30,
    silenceTimeout: agent.silenceTimeout ?? 5,
    dynamicEnabled: typeof agent.dynamicEnabled === 'boolean' ? agent.dynamicEnabled : true,
    interruptibleEnabled: typeof agent.interruptibleEnabled === 'boolean' ? agent.interruptibleEnabled : true,
    aiModel: agent.aiModel ?? agent.llm ?? 'GPT-4.1-Mini',
    transcription: agent.transcription ?? 'Azure',
    createdAt: agent.createdAt ?? new Date().toISOString(),
    updatedAt: agent.updatedAt ?? new Date().toISOString(),
  });

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const backendAgents = await whapi.get<AgentConfig[]>('/agents');
        setAgents(backendAgents.map(normalizeAgent));
      } catch (err) {
        console.error('Failed to fetch agents from backend', err);
        setAgents(loadAgents());
      }
    };
    fetchAgents();
  }, []);


  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    
    const name = prompt.trim();
    let welcomeMsg = '';
    let defaultFlow: any[] = [];

    // Attempt to generate flow dynamically from LLM backend (public endpoint — no auth needed)
    try {
      const genRes = await fetch('/api/v1/llm/generate-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (genRes.ok) {
        const generated = await genRes.json();
        if (generated && generated.welcomeMessage && Array.isArray(generated.flowItems)) {
          welcomeMsg = generated.welcomeMessage;
          defaultFlow = generated.flowItems;
        }
      } else {
        console.warn('generate-flow returned non-OK status:', genRes.status);
      }
    } catch (genErr) {
      console.warn('Failed to dynamically generate conversational flow, falling back to templates', genErr);
    }

    // Fallbacks if LLM generation failed or returned incomplete data
    if (!welcomeMsg) {
      welcomeMsg = getDefaultWelcomeMessage(name);
    }
    if (!defaultFlow || defaultFlow.length === 0) {
      defaultFlow = getDefaultFlowItems(name);
    }

    try {
      const newAgent = await whapi.post<AgentConfig>('/agents', { 
        name,
        welcomeMessage: welcomeMsg,
        flowItems: defaultFlow,
        aiModel: 'GPT-4.1-Mini',
        voice: 'Google - Aoede (female)',
      });
      
      setAgents(prev => [normalizeAgent(newAgent), ...prev]);
      setPrompt('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to create agent on backend', err);
      // Fallback to local storage using the generated settings
      const localId = String(Date.now());
      const nowStr = new Date().toISOString();
      const localAgent: AgentConfig = {
        id: localId,
        name,
        language: 'English (India)',
        llm: 'GPT-4.1-Mini',
        voice: 'Google - Aoede (female)',
        kbFiles: 0,
        search: 'Off',
        postCall: 'None',
        integrations: 'None',
        welcomeMessage: welcomeMsg,
        selectedLanguages: ['English (Indian)'],
        flowItems: defaultFlow,
        maxDuration: 30,
        silenceTimeout: 5,
        dynamicEnabled: true,
        interruptibleEnabled: true,
        aiModel: 'GPT-4.1-Mini',
        transcription: 'Azure',
        createdAt: nowStr,
        updatedAt: nowStr
      };

      const agentsList = loadAgents();
      agentsList.unshift(localAgent);
      localStorage.setItem('voice_ai_agents_v1', JSON.stringify(agentsList));

      setAgents(prev => [localAgent, ...prev]);
      setPrompt('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } finally {
      setCreating(false);
    }
  };


  const setTemplate = (template: string) => setPrompt(template);

  const isLocalAgent = (agent: AgentConfig) => /^\d+$/.test(agent.id);

  const handleDelete = async (assistant: AgentConfig) => {
    const confirmed = window.confirm(`Delete assistant "${assistant.name}"?`);
    if (!confirmed) return;

    const remainingAgents = agents.filter((agent) => agent.id !== assistant.id);
    setAgents(remainingAgents);
    saveAgents(remainingAgents);
    setOpenMenuId(null);

    if (!isLocalAgent(assistant)) {
      try {
        await whapi.del(`/agents/${assistant.id}`);
      } catch (err) {
        console.warn('Failed to delete backend agent, removed locally anyway', err);
      }
    } else {
      deleteAgent(assistant.id);
    }
  };

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.llm.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Voice AI Assistants</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Create and manage your voice AI assistants</p>
      </div>

      <div className="create-assistant-box">
        <h3>Create a new voice AI assistant</h3>
        <p>Describe the type of voice AI assistant you want to create</p>
        <textarea
          className="create-textarea"
          placeholder="Describe your voice AI assistant..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="create-actions">
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Choose from Use Case Categories:</p>
            <div className="use-case-chips">
              <button className="chip" onClick={() => setTemplate('Moon information assistant')}>Moon Information</button>
              <button className="chip" onClick={() => setTemplate('Customer support assistant for returns')}>Support</button>
              <button className="chip" onClick={() => setTemplate('Healthcare appointment reminder assistant')}>Appointments</button>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ flexShrink: 0, background: success ? '#22c55e' : '' }}
            onClick={handleCreate}
            disabled={creating || success || !prompt.trim()}
          >
            {creating ? 'Creating...' : success ? '✓ Created!' : 'Create Voice AI Assistant'}
          </button>
        </div>
      </div>

      <div className="assistants-section">
        <div className="assistants-header">
          <h2>My Voice AI Assistants</h2>
          <div className="assistants-header-actions">
            <div className="assistants-search">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                type="text"
                placeholder="Search assistants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="assistants-suggestions">
              <span>Suggested:</span>
              {['English', 'GPT-4', 'Moon', 'Support'].map(tag => (
                <button 
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="assistants-grid">
          <article className="assistant-card">
            <div className="assistant-card-head">
              <div>
                <h3>{hardcodedAssistant.name}</h3>
                <p>{hardcodedAssistant.language}</p>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  className="assistant-menu"
                  aria-label="Assistant actions"
                  title="Built-in assistant"
                  type="button"
                  onClick={() => setOpenMenuId(openMenuId === hardcodedAssistant.id ? null : hardcodedAssistant.id)}
                >
                  ⋮
                </button>
                {openMenuId === hardcodedAssistant.id && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      zIndex: 20,
                      minWidth: '180px',
                      background: 'rgba(15, 23, 42, 0.98)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '12px',
                      boxShadow: '0 12px 30px rgba(15, 23, 42, 0.45)',
                    }}
                  >
                    <button
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'left',
                        color: '#94a3b8',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'default',
                        fontSize: '13px',
                      }}
                      type="button"
                    >
                      Delete not available for built-in assistant
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="assistant-metadata">
              <div><span>LLM:</span> <strong>{hardcodedAssistant.llm}</strong></div>
              <div><span>Voice:</span> <strong>{hardcodedAssistant.voice}</strong></div>
              <div><span>KB Files:</span> <strong>{hardcodedAssistant.kbFiles}</strong></div>
              <div><span>Search:</span> <strong>{hardcodedAssistant.search}</strong></div>
              <div><span>Post-call (1):</span> <strong>{hardcodedAssistant.postCall}</strong></div>
              <div><span>Integrations (0):</span> <strong>{hardcodedAssistant.integrations}</strong></div>
            </div>

            <div className="assistant-card-footer">
              <span className="assistant-id">ID: #{hardcodedAssistant.id}</span>
              <button className="btn btn-primary" onClick={() => navigate(`/agent/${hardcodedAssistant.id}`)}>Edit Agent</button>
            </div>
          </article>

          {filteredAgents.length > 0 && filteredAgents.map((assistant) => (
              <article key={assistant.id} className="assistant-card">
                <div className="assistant-card-head">
                  <div>
                    <h3>{assistant.name}</h3>
                    <p>{assistant.language}</p>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      className="assistant-menu"
                      aria-label="Assistant actions"
                      onClick={() => setOpenMenuId(openMenuId === assistant.id ? null : assistant.id)}
                    >
                      ⋮
                    </button>
                    {openMenuId === assistant.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 'calc(100% + 8px)',
                          zIndex: 20,
                          minWidth: '140px',
                          background: 'rgba(15, 23, 42, 0.98)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '12px',
                          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.45)',
                        }}
                      >
                        <button
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            textAlign: 'left',
                            color: '#f87171',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                          onClick={() => handleDelete(assistant)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="assistant-metadata">
                  <div><span>LLM:</span> <strong>{assistant.llm}</strong></div>
                  <div><span>Voice:</span> <strong>{assistant.voice}</strong></div>
                  <div><span>KB Files:</span> <strong>{assistant.kbFiles}</strong></div>
                  <div><span>Search:</span> <strong>{assistant.search}</strong></div>
                  <div><span>Post-call:</span> <strong>{assistant.postCall}</strong></div>
                  <div><span>Integrations:</span> <strong>{assistant.integrations}</strong></div>
                </div>

                <div className="assistant-card-footer">
                  <span className="assistant-id">ID: {assistant.id}</span>
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/agent/${assistant.id}`)}
                  >
                    Edit Agent
                  </button>
                </div>
              </article>
            ))}
        </div>
      </div>
    </>
  );
}
