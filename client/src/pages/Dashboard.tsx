import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentConfig, createAgent, loadAgents, getDefaultFlowItems, getDefaultWelcomeMessage } from '../lib/agentStore';
import { whapi } from '../lib/whapi';


export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdownId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  const handleCopyAssistant = async (e: React.MouseEvent, assistant: AgentConfig) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    const newName = `${assistant.name} (Copy)`;
    try {
      const newAgentDetails = {
        name: newName,
        welcomeMessage: assistant.welcomeMessage || '',
        flowItems: assistant.flowItems || [],
        aiModel: assistant.aiModel || 'GPT-4.1-Mini',
        voice: assistant.voice || 'Google - Aoede (female)',
      };
      const newAgent = await whapi.post<AgentConfig>('/agents', newAgentDetails);
      setAgents(prev => [newAgent, ...prev]);
    } catch (err) {
      console.error('Failed to copy agent on backend', err);
      // Fallback
      const localId = String(Date.now());
      const nowStr = new Date().toISOString();
      const localAgent: AgentConfig = {
        ...assistant,
        id: localId,
        name: newName,
        createdAt: nowStr,
        updatedAt: nowStr
      };
      const agentsList = loadAgents();
      agentsList.unshift(localAgent);
      localStorage.setItem('voice_ai_agents_v1', JSON.stringify(agentsList));
      setAgents(prev => [localAgent, ...prev]);
    }
  };

  const handleDeleteAssistant = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    if (!window.confirm('Are you sure you want to delete this assistant?')) return;
    try {
      await whapi.delete(`/agents/${id}`);
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete on backend', err);
      // Fallback local
      const agentsList = loadAgents().filter(a => a.id !== id);
      localStorage.setItem('voice_ai_agents_v1', JSON.stringify(agentsList));
      setAgents(prev => prev.filter(a => a.id !== id));
    }
  };

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

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const backendAgents = await whapi.get<AgentConfig[]>('/agents');
        setAgents(backendAgents);
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
      
      setAgents(prev => [newAgent, ...prev]);
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
                  onClick={(e) => handleMenuClick(e, hardcodedAssistant.id)}
                >
                  ⋮
                </button>
                {openDropdownId === hardcodedAssistant.id && (
                  <div className="assistant-menu-dropdown">
                    <button onClick={(e) => handleCopyAssistant(e, hardcodedAssistant as any)}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      Copy Assistant
                    </button>
                    <button className="delete-btn" onClick={(e) => handleDeleteAssistant(e, hardcodedAssistant.id)}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      Delete Assistant
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
                      onClick={(e) => handleMenuClick(e, assistant.id)}
                    >
                      ⋮
                    </button>
                    {openDropdownId === assistant.id && (
                      <div className="assistant-menu-dropdown">
                        <button onClick={(e) => handleCopyAssistant(e, assistant)}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          Copy Assistant
                        </button>
                        <button className="delete-btn" onClick={(e) => handleDeleteAssistant(e, assistant.id)}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                          Delete Assistant
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
