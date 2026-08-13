import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { whapi } from '../lib/whapi';
import { RzCard, RzEmpty, RzPill, RzSkeleton, RzStat } from '@/components/rz';

/**
 * Phone numbers — the inventory view from Spandan Workspace.dc.html#numbers.
 *
 * This page used to be a static mock that always said "No phone numbers yet",
 * regardless of what the workspace actually owned. It now reads the same
 * `/caller-numbers` endpoint the caller picker uses, so what you see here is
 * what an outbound call can actually dial from.
 */

/**
 * `source` is open-ended on purpose: the backend returns the carrier id
 * lower-cased for anything routed through VoiceNumber ('plivo', 'exotel'), and
 * new carriers must not need a client change to appear at all. Only 'own' —
 * a number the user verified rather than one the platform holds — is treated
 * specially.
 */
interface NumberOpt {
  phoneNumber: string;
  label: string;
  source: 'twilio' | 'own' | string;
}

/** Badge text per source. Unknown carriers fall back to their own name. */
const sourceLabel = (source: string) => {
  if (source === 'own') return 'Verified';
  if (source === 'twilio') return 'Platform';
  return source.charAt(0).toUpperCase() + source.slice(1);
};

/** E.164 dialling code → flag, for the countries the platform sells in. */
const FLAGS: Record<string, string> = {
  '+1': '🇺🇸',
  '+44': '🇬🇧',
  '+91': '🇮🇳',
  '+61': '🇦🇺',
  '+65': '🇸🇬',
  '+971': '🇦🇪',
};

const flagFor = (n: string) => {
  // Longest prefix first so +1 doesn't swallow +91.
  const hit = Object.keys(FLAGS).sort((a, b) => b.length - a.length).find(p => n.startsWith(p));
  return hit ? FLAGS[hit] : '🌐';
};

const regionFor = (n: string) => {
  if (n.startsWith('+91')) return 'India';
  if (n.startsWith('+44')) return 'United Kingdom';
  if (n.startsWith('+61')) return 'Australia';
  if (n.startsWith('+65')) return 'Singapore';
  if (n.startsWith('+971')) return 'United Arab Emirates';
  if (n.startsWith('+1')) return 'United States / Canada';
  return 'International';
};

export default function PhoneNumbers() {
  const [owned, setOwned] = useState<NumberOpt[]>([]);
  const [verified, setVerified] = useState<NumberOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    whapi
      .get<{ owned: NumberOpt[]; verified: NumberOpt[] }>('/caller-numbers')
      .then(r => { setOwned(r.owned ?? []); setVerified(r.verified ?? []); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load numbers'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const all = [...owned, ...verified];

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap">
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Workspace</div>
            <h1 className="rz-h1">Phone numbers</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 620 }}>
              The numbers your agents can call from and be reached on. Platform numbers are ready to dial;
              your own numbers ring once to verify before they can be used as a caller ID.
            </p>
          </div>
        </div>

        <div className="rz-stats" style={{ marginBottom: 18 }}>
          <RzStat label="TOTAL NUMBERS" value={loading ? '—' : all.length} />
          <RzStat label="PLATFORM" value={loading ? '—' : owned.length} color="var(--cyan-fg)" />
          <RzStat label="VERIFIED OWN" value={loading ? '—' : verified.length} color="var(--lime)" />
        </div>

        {error && (
          <div
            className="rz-card rz-between"
            style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: 13, marginBottom: 14 }}
          >
            <span>{error}</span>
            <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={load}>Retry</button>
          </div>
        )}

        {/* Inventory */}
        {loading ? (
          <RzSkeleton rows={3} height={64} />
        ) : all.length === 0 ? (
          <RzCard>
            <RzEmpty
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              }
              title="No numbers yet"
              text="Buy a platform number to start taking calls, or verify a number you already own so your agents can dial out from it."
            />
          </RzCard>
        ) : (
          <div className="rz-stack-sm">
            {all.map(n => (
              <div
                key={n.phoneNumber}
                className="rz-card"
                style={{ padding: '16px 18px', borderRadius: 13, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
              >
                <span style={{ fontSize: 20 }} aria-hidden>{flagFor(n.phoneNumber)}</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div className="rz-title-lg" style={{ fontFamily: 'var(--ff-m)', letterSpacing: '-0.3px' }}>{n.phoneNumber}</div>
                  <div className="rz-mono-xs">{regionFor(n.phoneNumber)} · voice</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="rz-sub" style={{ fontSize: 12.5 }}>{n.label || '—'}</div>
                  <div className="rz-mono-xs">label</div>
                </div>
                <RzPill tone={n.source === 'own' ? 'ok' : 'info'}>{sourceLabel(n.source)}</RzPill>
              </div>
            ))}
          </div>
        )}

        {/* Acquire */}
        <div className="rz-grid-2" style={{ marginTop: 22 }}>
          <RzCard title="Buy a number" label="New">
            <p className="rz-sub" style={{ margin: '0 0 14px' }}>
              Get a number provisioned for calling and campaigns in a few seconds. Indian (+91) and US (+1)
              inventory available.
            </p>
            <div className="rz-stack-sm" style={{ marginBottom: 16 }}>
              <div className="rz-card" style={{ background: 'rgba(14,179,158,0.05)', borderColor: 'rgba(14,179,158,0.28)', padding: 14, borderRadius: 11 }}>
                <div className="rz-title" style={{ fontSize: 13.5, marginBottom: 5 }}>Connect agents &amp; campaigns</div>
                <p className="rz-sub" style={{ fontSize: 12, margin: 0 }}>
                  Assign a number to an agent for inbound calls, or use it as the caller ID for outbound campaigns.
                </p>
              </div>
              <div className="rz-card" style={{ background: 'rgba(249,115,22,0.05)', borderColor: 'rgba(249,115,22,0.28)', padding: 14, borderRadius: 11 }}>
                <div className="rz-title" style={{ fontSize: 13.5, marginBottom: 5 }}>Global coverage</div>
                <p className="rz-sub" style={{ fontSize: 12, margin: 0 }}>
                  Local presence where your customers are, with verified-calling support on Indian carriers.
                </p>
              </div>
            </div>
            <Link className="rz-btn rz-btn-primary rz-btn-block" to="/contact">Talk to us about numbers →</Link>
          </RzCard>

          <RzCard title="Bring your own">
            <p className="rz-sub" style={{ margin: '0 0 14px' }}>
              Already have a provider? Verify a number you control and your agents can dial out from it.
            </p>
            <div className="rz-stack-sm">
              {[
                { label: 'Import from Twilio', to: '/integrations' },
                { label: 'Import from Exotel', to: '/integrations' },
                { label: 'Connect a SIP trunk', to: '/integrations/SIPTrunking' },
                { label: 'Airtel verified calling', to: '/airtel-verified-calling' },
              ].map(item => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rz-card-btn"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textDecoration: 'none' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--tx)' }}>{item.label}</span>
                  <span className="rz-mono" style={{ color: 'var(--cyan-fg)' }}>→</span>
                </Link>
              ))}
            </div>
          </RzCard>
        </div>
      </div>
    </div>
  );
}
