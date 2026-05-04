import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentConfig, createAgent, loadAgents } from '../lib/agentStore';
import { whapi } from '../lib/whapi';


export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

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
    
    try {
      const newAgent = await whapi.post<AgentConfig>('/agents', { 
        name: prompt.trim(),
        welcomeMessage: `Hello, I am ${prompt.trim()}. How can I help you today?`,
        aiModel: 'GPT-4.1-Mini',
        voice: 'Google - Aoede (female)',
      });
      
      setAgents(prev => [newAgent, ...prev]);
      setPrompt('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to create agent on backend', err);
      // Fallback to local
      const localAgent = createAgent(prompt.trim());
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2>My Voice AI Assistants</h2>
          <div className="assistants-search">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Search assistants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="assistants-grid">
          {filteredAgents.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#999' }}>
              No assistants match your search. Create one to get started.
            </div>
          ) : (
            filteredAgents.map((assistant) => (
              <article key={assistant.id} className="assistant-card">
                <div className="assistant-card-head">
                  <div>
                    <h3>{assistant.name}</h3>
                    <p>{assistant.language}</p>
                  </div>
                  <button className="assistant-menu" aria-label="Assistant actions">⋮</button>
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
            ))
          )}
        </div>
      </div>
    </>
  );
}
