import { Link } from 'react-router-dom';
import { isCustomerSession } from '@/lib/authStorage';

const DOC_CARDS = [
  { title: 'Getting started', desc: 'Install the SDK and make your first call.' },
  { title: 'Client', desc: 'Initialise and configure the Spandan client.' },
  { title: 'Agent', desc: 'Create, manage and customise AI agents.' },
  { title: 'Call', desc: 'Place calls and read the call log.' },
  { title: 'Integrations', desc: 'Connect external services and APIs.' },
  { title: 'Knowledge base', desc: 'Manage the files your agents ground answers in.' },
];

export default function Docs() {
  // This page renders in two shells (see AdaptiveLayout in App.tsx). Inside the
  // dashboard, a "Home" crumb pointing at the marketing site and an "Open
  // Dashboard" button are both wrong — the reader is already in the app.
  const inDashboard = isCustomerSession();

  return (
    <div className="rz-page">
      <div className="container">
        <div className="breadcrumb">
          <Link to={inDashboard ? '/dashboard' : '/'}>{inDashboard ? 'Dashboard' : 'Home'}</Link>
          <span>›</span>
          <span style={{ color: 'var(--tx)' }}>Docs</span>
        </div>
      </div>

      <div className="doc-hero">
        <div className="container">
          <div className="rz-eyebrow-pill" style={{ marginBottom: 18 }}>Developer documentation</div>
          <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 46px)' }}>Spandan docs</h1>
          <p className="rz-sub-lg" style={{ margin: '14px auto 0', maxWidth: 560 }}>
            The API, setup guides and support resources for building on Spandan.
          </p>
          <div className="doc-actions">
            <a href="#overview" className="rz-btn rz-btn-primary rz-btn-lg">Explore guides →</a>
            {!inDashboard && (
              <Link to="/dashboard" className="rz-btn rz-btn-secondary rz-btn-lg">Open dashboard</Link>
            )}
          </div>
        </div>
      </div>

      <div className="container" id="overview">
        <div className="doc-grid" style={{ marginBottom: 80 }}>
          {DOC_CARDS.map((card) => (
            <div key={card.title} className="doc-card">
              <div className="doc-card-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <div className="learn-more">Learn more →</div>
            </div>
          ))}
        </div>

        <div className="cta-box" style={{ marginBottom: 80 }}>
          <div className="rz-eyebrow-pill" style={{ marginBottom: 18 }}>Developer API</div>
          <h2 className="rz-h2" style={{ fontSize: 'clamp(24px, 3vw, 32px)' }}>
            Ready to build your voice assistant?
          </h2>
          <p className="rz-sub-lg" style={{ margin: '14px auto 28px', maxWidth: 560 }}>
            Connect your workspace, configure an agent, and put it on a phone number.
          </p>
          <Link to="/dashboard" className="rz-btn rz-btn-primary rz-btn-lg">Start building →</Link>
        </div>
      </div>
    </div>
  );
}
