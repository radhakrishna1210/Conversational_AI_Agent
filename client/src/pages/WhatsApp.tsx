import { Link } from 'react-router-dom';
import { RzCard } from '@/components/rz';

/**
 * WhatsApp connection chooser.
 *
 * Two ways in, and they are not equivalent: a QR pairing against an existing
 * handset, or the Meta Cloud API. The design's WhatsApp screen is an inbox, but
 * an inbox has nothing to show until one of these is connected, so this page is
 * the step before it.
 */

const OPTIONS = [
  {
    key: 'phone',
    title: 'Phone WhatsApp',
    desc: 'Pair with a number you already use, by scanning a QR code from the handset. Fastest to try; tied to that one device staying online.',
    to: '/integrations',
    markClass: 'rz-mark-lime',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    key: 'cloud',
    title: 'Cloud WhatsApp',
    desc: 'The Meta Cloud API — no handset in the loop, higher throughput, and template messaging. This is the one to pick for production volume.',
    to: '/integrations',
    markClass: 'rz-mark-violet',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
  },
];

export default function WhatsApp() {
  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap" style={{ maxWidth: 860 }}>
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Chat</div>
            <h1 className="rz-h1">WhatsApp</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 600 }}>
              Connect a WhatsApp Business account and your agents can hold the same conversations
              over chat that they hold on a call.
            </p>
          </div>
        </div>

        <div className="rz-grid-2">
          {OPTIONS.map(o => (
            <Link
              key={o.key}
              to={o.to}
              className="rz-card-btn"
              style={{ padding: 26, borderRadius: 15, textDecoration: 'none' }}
            >
              <span className={`rz-mark rz-mark-lg ${o.markClass}`}>{o.icon}</span>
              <div className="rz-title-lg" style={{ marginTop: 14 }}>{o.title}</div>
              <p className="rz-sub" style={{ margin: '8px 0 0' }}>{o.desc}</p>
              <div className="rz-mono" style={{ color: 'var(--cyan-fg)', marginTop: 14 }}>Connect →</div>
            </Link>
          ))}
        </div>

        <RzCard style={{ marginTop: 16 }} label="Note" title="Either route uses the same agent">
          <p className="rz-sub" style={{ margin: 0 }}>
            The agent's prompt, knowledge base and tools are shared across voice and chat — you
            configure it once in the agent builder, and the channel only decides how the words
            arrive.
          </p>
        </RzCard>
      </div>
    </div>
  );
}
