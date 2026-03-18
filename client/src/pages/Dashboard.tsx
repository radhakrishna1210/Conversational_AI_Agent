import { useState } from 'react';

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  
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

        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <h3>No assistants yet</h3>
          <p>Create your first Voice AI Assistant to get started.</p>
          <button className="btn btn-primary" onClick={() => document.querySelector<HTMLTextAreaElement>('.create-textarea')?.focus()}>
            + Create Assistant
          </button>
        </div>
      </div>
    </>
  );
}
