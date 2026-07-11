import { Link } from 'react-router-dom';

export default function Documentation() {
  const docCards = [
    { icon: '📱', color: '#60a5fa', title: 'Getting Started', desc: 'Learn how to install and set up the OmniDimension SDK', to: '/docs/getting-started' },
    { icon: '🖥️', color: '#a78bfa', title: 'Client', desc: 'Initialize and configure the OmniDimension client', to: '/docs/client' },
    { icon: '💬', color: '#34d399', title: 'Agent', desc: 'Create, manage, and customize AI agents', to: '/docs/agent' },
    { icon: '📞', color: '#fbbf24', title: 'Call', desc: 'Manage call logs and dispatch calls', to: '/docs/call' },
    { icon: '⚡', color: '#ef4444', title: 'Integrations', desc: 'Connect with external services and APIs', to: '/docs/integrations' },
    { icon: '🗄️', color: '#3b82f6', title: 'Knowledge Base', desc: 'Manage files and knowledge for your agents', to: '/docs/knowledge-base' },
  ];

  return (
    <>
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span>›</span>
          <span style={{color:'var(--text-primary)'}}>Documentation</span>
        </div>
      </div>

      <div className="doc-hero">
        <div className="badge" style={{margin:'0 auto 20px'}}>Developer Documentation</div>
        <h1>OmniDimension SDK</h1>
        <p className="subtitle">Build powerful AI voice agents with our easy-to-use SDK</p>
        <div className="doc-actions">
          <Link to="/docs/getting-started" className="btn btn-primary btn-lg">Get Started →</Link>
          <a href="https://github.com/omnidimension" className="btn btn-secondary btn-lg" target="_blank" rel="noreferrer">
            View SDK on GitHub ↗
          </a>
        </div>
      </div>

      <div className="container">
        <div className="video-container animate-me">
          <div className="video-overlay">
            <div className="video-title">OMNI<span style={{fontStyle:'italic'}}>)</span>MENSION</div>
            <button className="video-play-btn">▶</button>
            <div className="video-badge">VIDEO TUTORIAL</div>
          </div>
        </div>

        <div className="doc-grid" style={{marginBottom:'80px'}}>
          {docCards.map((card, i) => (
            <Link key={i} to={card.to} style={{ textDecoration: 'none' }}>
              <div className="doc-card animate-me" style={{ cursor: 'pointer', height: '100%' }}>
                <div className="doc-card-icon" style={{color: card.color}}>{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <div className="learn-more">Learn more →</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="cta-box animate-me" style={{marginBottom: '80px'}}>
          <div className="badge" style={{margin:'0 auto 20px'}}>Developer API</div>
          <h2>Ready to build your AI voice agent?</h2>
          <p>Get started with OmniDimension SDK today and create powerful AI voice experiences for your users.</p>
          <Link to="/dashboard" className="btn btn-primary btn-lg">Start Building →</Link>
        </div>
      </div>
    </>
  );
}
