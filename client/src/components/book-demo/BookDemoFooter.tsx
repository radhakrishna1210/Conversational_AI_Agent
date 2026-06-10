import { Link } from 'react-router-dom';

const columns = [
  {
    title: 'Solutions',
    links: [
      { label: 'Customer Support', to: '#' },
      { label: 'Lead Generation', to: '#' },
      { label: 'Appointments', to: '#' },
      { label: 'Collections', to: '#' },
    ],
  },
  {
    title: 'Product',
    links: [
      { label: 'Voice AI Agents', to: '/dashboard' },
      { label: 'Bulk Calling', to: '/bulk_call' },
      { label: 'WhatsApp', to: '/whatsapp' },
      { label: 'Integrations', to: '/integrations' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', to: '/documentation' },
      { label: 'API Reference', to: '/docs' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Report an Issue', to: '/report-issue' },
    ],
  },
  {
    title: 'Sales & Support',
    links: [
      { label: 'Contact Us', to: '/contact' },
      { label: 'Book a Demo', to: '/book-appointment' },
      { label: 'Enterprise', to: '/contact' },
      { label: 'Status', to: '#' },
    ],
  },
];

export default function BookDemoFooter() {
  return (
    <footer className="book-demo-site-footer">
      <div className="book-demo-footer-inner">
        <div className="book-demo-footer-brand">
          <div className="book-demo-footer-logo" aria-hidden="true">
            O
          </div>
        </div>

        <div className="book-demo-footer-columns">
          {columns.map((col) => (
            <div key={col.title} className="book-demo-footer-col">
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.to.startsWith('/') ? (
                      <Link to={link.to}>{link.label}</Link>
                    ) : (
                      <a href={link.to}>{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <p className="book-demo-footer-copy">© 2026 OmniDimension. All rights reserved.</p>
    </footer>
  );
}
