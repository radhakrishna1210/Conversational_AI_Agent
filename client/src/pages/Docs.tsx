import { Link } from 'react-router-dom';

export default function Docs() {
  const docCards = [
    { icon: '📱', title: 'Getting Started', desc: 'Learn how to install and set up the OmniDimension SDK.' },
    { icon: '🖥️', title: 'Client', desc: 'Initialize and configure the OmniDimension client.' },
    { icon: '💬', title: 'Agent', desc: 'Create, manage, and customize AI agents.' },
    { icon: '📞', title: 'Call', desc: 'Manage call logs and dispatch calls.' },
    { icon: '⚡', title: 'Integrations', desc: 'Connect with external services and APIs.' },
    { icon: '🗄️', title: 'Knowledge Base', desc: 'Manage files and knowledge for your agents.' }
  ];

  return (
    <>
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span>›</span>
          <span style={{color:'var(--text-primary)'}}>Docs</span>
        </div>
      </div>

      <div className="doc-hero">
        <div className="container">
          <div className="badge" style={{margin:'0 auto 20px'}}>Developer Documentation</div>
          <h1>OmniDimension Docs</h1>
          <p className="subtitle">Explore the API, setup guides, and support resources to build your AI workflows.</p>
          <div className="doc-actions">
            <a href="#overview" className="btn btn-primary btn-lg">Explore Guides →</a>
            <Link to="/dashboard" className="btn btn-secondary btn-lg">Open Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="doc-grid" style={{marginBottom:'80px'}}>
          {docCards.map((card, index) => (
            <div key={index} className="doc-card">
              <div className="doc-card-icon">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <div className="learn-more">Learn more →</div>
            </div>
          ))}
        </div>

        <div className="cta-box" style={{marginBottom:'80px'}}>
          <div className="badge" style={{margin:'0 auto 20px'}}>Developer API</div>
          <h2>Ready to build your AI voice assistant?</h2>
          <p>Get started with OmniDimension by connecting your workspace, managing agents, and deploying voice campaigns.</p>
          <Link to="/dashboard" className="btn btn-primary btn-lg">Start Building →</Link>
        </div>
      </div>
    </>
  );
}
