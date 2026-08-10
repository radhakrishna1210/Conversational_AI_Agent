import { Link } from 'react-router-dom';

/**
 * SDK documentation landing page.
 *
 * The card icons used to carry six arbitrary hexes (#60a5fa, #a78bfa, #34d399,
 * #fbbf24, #ef4444, #3b82f6) that appeared nowhere else in the product and
 * meant nothing — "Integrations" was red, which reads as an error state. The
 * whole set now takes the one brand tint the design uses for a section mark,
 * because these are six equal doors, not six severities.
 *
 * The fake video player is also gone: a play button over an empty black box
 * that did nothing when clicked.
 */

const DOC_CARDS = [
  { title: 'Getting started', desc: 'Install the SDK and make your first call.' },
  { title: 'Client', desc: 'Initialise and configure the Spandan client.' },
  { title: 'Agent', desc: 'Create, manage and customise AI agents.' },
  { title: 'Call', desc: 'Place calls and read the call log.' },
  { title: 'Integrations', desc: 'Connect external services and APIs.' },
  { title: 'Knowledge base', desc: 'Manage the files your agents ground answers in.' },
];

export default function Documentation() {
  return (
    <div className="rz-page">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span>›</span>
          <span style={{ color: 'var(--tx)' }}>Documentation</span>
        </div>
      </div>

      <div className="doc-hero">
        <div className="rz-eyebrow-pill" style={{ marginBottom: 18 }}>Developer documentation</div>
        <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 46px)' }}>Spandan SDK</h1>
        <p className="rz-sub-lg" style={{ margin: '14px auto 0', maxWidth: 560 }}>
          Build voice agents against the same API the dashboard uses.
        </p>
        <div className="doc-actions">
          <Link to="/docs" className="rz-btn rz-btn-primary rz-btn-lg">Get started →</Link>
          <a
            href="https://github.com/omnidimension"
            className="rz-btn rz-btn-secondary rz-btn-lg"
            target="_blank"
            rel="noreferrer"
          >
            View SDK on GitHub ↗
          </a>
        </div>
      </div>

      <div className="container">
        <div className="doc-grid" style={{ marginBottom: 80 }}>
          {DOC_CARDS.map((card) => (
            <div className="doc-card" key={card.title}>
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
            Ready to build your voice agent?
          </h2>
          <p className="rz-sub-lg" style={{ margin: '14px auto 28px', maxWidth: 560 }}>
            Start with the SDK today and put a voice in front of your users.
          </p>
          <Link to="/dashboard" className="rz-btn rz-btn-primary rz-btn-lg">Start building →</Link>
        </div>
      </div>
    </div>
  );
}
