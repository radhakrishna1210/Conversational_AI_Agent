import { Link } from 'react-router-dom';

/**
 * Site footer — the four-column sitemap from Spandan Homepage.dc.html.
 *
 * The previous footer was one row of five links, every one of them `href="#"`.
 * Five dead links is worse than none: they invite a click and answer with a
 * jump to the top of the page. Every link below resolves to a route that exists
 * in App.tsx — the columns are drawn from the design, but the entries are
 * filtered to what this build actually ships.
 */

interface Column {
  title: string;
  links: Array<{ label: string; to: string }>;
}

const COLUMNS: Column[] = [
  {
    title: 'Product',
    links: [
      { label: 'Agent builder', to: '/dashboard' },
      { label: 'Bulk campaigns', to: '/bulk_call' },
      { label: 'Knowledge base', to: '/files' },
      { label: 'Voice cloning', to: '/clone_voice' },
      { label: 'Call analytics', to: '/analytics' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Lead generation', to: '/solutions/use-cases/lead-generation' },
      { label: 'Appointments', to: '/solutions/use-cases/appointments' },
      { label: 'Customer support', to: '/solutions/use-cases/customer-support' },
      { label: 'Collections', to: '/solutions/use-cases/collections' },
      { label: 'Negotiation', to: '/solutions/use-cases/negotiation' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentation', to: '/documentation' },
      { label: 'API reference', to: '/docs' },
      { label: 'Integrations', to: '/integrations' },
      { label: 'Phone numbers', to: '/phone_numbers' },
      { label: 'WhatsApp', to: '/whatsapp' },
      { label: 'API keys', to: '/api_keys' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Contact', to: '/contact' },
      { label: 'Book a demo', to: '/book-appointment' },
      { label: 'Report an issue', to: '/report-issue' },
      { label: 'Sign in', to: '/login' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="sp-footer">
      <div className="sp-footer-grid">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tx)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 12px var(--cyan)' }} />
            <span style={{ fontFamily: 'var(--ff-d)', fontWeight: 700, fontSize: 18 }}>Spandan</span>
          </div>
          <p style={{ color: 'var(--tx-3)', fontSize: 13.5, lineHeight: 1.6, margin: '14px 0 0', maxWidth: 240 }}>
            Conversational voice AI for teams that live on the phone.
            स्पंदन — the pulse of a conversation.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="rz-label" style={{ marginBottom: 12 }}>{col.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 14 }}>
              {col.links.map((l) => (
                <Link key={l.label} to={l.to} className="sp-footer-link">{l.label}</Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sp-footer-bar">
        <span>© {new Date().getFullYear()} Spandan, Inc.</span>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Link to="/privacy-policy" className="sp-footer-link">Privacy</Link>
          <Link to="/terms" className="sp-footer-link">Terms</Link>
          <span>Made for voice</span>
        </span>
      </div>

      <style>{`
        .sp-footer {
          position: relative;
          z-index: 1;
          border-top: 1px solid var(--line);
          background: var(--bg-2);
          margin-top: auto;
          padding: 0;
        }

        .sp-footer-grid {
          max-width: 1180px;
          margin: 0 auto;
          padding: 56px 24px 30px;
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr;
          gap: 28px;
        }

        .sp-footer-link {
          color: var(--tx-2);
          text-decoration: none;
          transition: color 0.15s ease;
        }

        .sp-footer-link:hover { color: var(--tx); }

        .sp-footer-bar {
          border-top: 1px solid var(--line);
          max-width: 1180px;
          margin: 0 auto;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          font-family: var(--ff-m);
          font-size: 12px;
          color: var(--tx-3);
        }

        .sp-footer-bar .sp-footer-link { color: var(--tx-3); }

        /* Five columns need ~1000px to stay readable; below that they pair up,
           then stack. The brand blurb keeps the full width in both cases. */
        @media (max-width: 1000px) {
          .sp-footer-grid { grid-template-columns: repeat(3, 1fr); }
          .sp-footer-grid > :first-child { grid-column: 1 / -1; }
        }
        @media (max-width: 640px) {
          .sp-footer-grid { grid-template-columns: repeat(2, 1fr); padding: 40px 20px 24px; }
        }
      `}</style>
    </footer>
  );
}
