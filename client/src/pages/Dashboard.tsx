import { useState } from 'react';

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);

  const hardcodedAssistant = {
    name: 'Outbound Lead Qualification Agent',
    language: 'English (India)',
    llm: 'gpt-4.1-mini',
    voice: 'google',
    kbFiles: 0,
    search: 'Off',
    postCall: 'None',
    integrations: 'None',
    id: '#131000',
  };
  
  const handleCreate = () => {
    if (!prompt.trim()) return;
    setCreating(true);
    setTimeout(() => {
      setCreating(false);
      setSuccess(true);
      setPrompt('');
      setTimeout(() => setSuccess(false), 2000);
    }, 1500);
  };

  const setTemplate = (template: string) => setPrompt(template);

  return (
    <>
      <div style={{marginBottom:'32px'}}>
        <h1 style={{fontSize:'28px', fontWeight:800, letterSpacing:'-0.5px', marginBottom:'6px'}}>Voice AI Assistants</h1>
        <p style={{color:'var(--text-secondary)', fontSize:'14px'}}>Create and manage your voice AI assistants</p>
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
            <p style={{fontSize:'12px', color:'var(--text-muted)', marginBottom:'10px'}}>Choose from Use Case Categories:</p>
            <div className="use-case-chips">
              <button className="chip" onClick={() => setTemplate('Create a lead qualification assistant')}>Lead Generation</button>
              <button className="chip" onClick={() => setTemplate('Create a healthcare appointment reminder')}>Appointments</button>
              <button className="chip" onClick={() => setTemplate('Create a customer support assistant for returns')}>Support</button>
            </div>
          </div>
          <button 
            className="btn btn-primary" 
            style={{flexShrink:0, background: success ? '#22c55e' : ''}} 
            onClick={handleCreate}
            disabled={creating || success || !prompt.trim()}
          >
            {creating ? 'Creating...' : success ? '✓ Created!' : 'Create Voice AI Assistant'}
          </button>
        </div>
      </div>

      <div className="assistants-section">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px'}}>
          <h2>My Voice AI Assistants</h2>
          <div className="assistants-search">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Search assistants..." />
          </div>
        </div>

        <div className="assistants-grid">
          <article className="assistant-card">
            <div className="assistant-card-head">
              <div>
                <h3>{hardcodedAssistant.name}</h3>
                <p>{hardcodedAssistant.language}</p>
              </div>
              <button className="assistant-menu" aria-label="Assistant actions">⋮</button>
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
              <span className="assistant-id">ID: {hardcodedAssistant.id}</span>
              <button className="btn btn-primary">Edit Agent</button>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
