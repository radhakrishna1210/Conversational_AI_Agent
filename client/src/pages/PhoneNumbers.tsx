import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { whapi } from '../lib/whapi';
import { RzCard, RzEmpty, RzPill, RzSkeleton, RzStat } from '@/components/rz';

/**
 * Phone numbers — the inventory view from Spandan Workspace.dc.html#numbers.
 *
 * Two sources, deliberately joined here rather than in one endpoint:
 *
 *   /caller-numbers    what an outbound call can dial FROM. Twilio's live list
 *                      plus the workspace's carrier numbers; it is the caller
 *                      picker's own source, so this page cannot show a number
 *                      the picker would not offer.
 *   /compliance        what the workspace HOLDS on a carrier we manage — DLT
 *                      header state, inbound routing, monthly price. A Twilio
 *                      number has none of that, which is why it is a separate
 *                      read rather than a wider one.
 */

interface NumberOpt {
  phoneNumber: string;
  label: string;
  /**
   * Open-ended on purpose: the backend returns the carrier id lower-cased for
   * anything routed through VoiceNumber ('plivo', 'piopiy'), and new carriers
   * must not need a client change to appear at all. Only 'own' — a number the
   * user verified rather than one the platform holds — is treated specially.
   */
  source: 'twilio' | 'own' | string;
}

/**
 * A number the workspace still holds but cannot dial from — today that means
 * suspended for an unpaid rental.
 *
 * Listed separately rather than filtered out. It is still rented, still theirs,
 * and vanishing from this page with no explanation is how "why did my campaigns
 * stop?" becomes a support ticket instead of a top-up.
 */
interface UnavailableNumber extends NumberOpt {
  reason: string;
  actionText?: string;
  actionLink?: string;
}

type HeaderStatus = 'NOT_REGISTERED' | 'SUBMITTED' | 'REGISTERED' | 'REJECTED';

interface CarrierNumber {
  id: string;
  phoneNumber: string;
  provider: string;
  series: string;
  status: string;
  headerStatus: HeaderStatus;
  headerRejectionReason: string | null;
  inboundAgentId: string | null;
  clientMonthlyCents: number | null;
  nextRenewalAt: string | null;
}

interface Agent { id: string; name: string }

/** What each DLT header state means for whether calls actually connect. */
const HEADER_VIEW: Record<HeaderStatus, { tone: 'ok' | 'warn' | 'err' | 'idle'; label: string; text: string }> = {
  NOT_REGISTERED: {
    tone: 'idle',
    label: 'Header not registered',
    text: 'Register this number as a header under your DLT Principal Entity on your operator\'s portal, then tell us here. Until it clears, calls from it are blocked — by us and by the network.',
  },
  SUBMITTED: {
    tone: 'warn',
    label: 'Header submitted',
    text: 'Your operator is reviewing the header registration. Update this once they approve or reject it.',
  },
  REGISTERED: { tone: 'ok', label: 'Header registered', text: '' },
  REJECTED: {
    tone: 'err',
    label: 'Header rejected',
    text: 'Your operator rejected the header. Fix it on their portal and update this once it is approved.',
  },
};

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
  const [unavailable, setUnavailable] = useState<UnavailableNumber[]>([]);
  const [carrier, setCarrier] = useState<CarrierNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // Each read stands alone: a workspace with no Twilio credentials must still
    // see its carrier numbers, and a compliance table that has not been
    // migrated must not blank the page.
    const callerNumbers = whapi
      .get<{ owned: NumberOpt[]; verified: NumberOpt[]; unavailable?: UnavailableNumber[] }>('/caller-numbers')
      .then(r => {
        setOwned(r.owned ?? []);
        setVerified(r.verified ?? []);
        setUnavailable(r.unavailable ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load numbers'));

    const compliance = whapi
      .get<{ numbers?: CarrierNumber[] }>('/compliance')
      .then(r => setCarrier((r.numbers ?? []).filter(n => n.status !== 'RELEASED')))
      .catch(() => setCarrier([]));

    const agentList = whapi.get<Agent[]>('/agents')
      .then(r => setAgents(Array.isArray(r) ? r : []))
      .catch(() => setAgents([]));

    void Promise.allSettled([callerNumbers, compliance, agentList]).then(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const setHeader = async (numberId: string, status: HeaderStatus) => {
    setBusy(numberId);
    try {
      await whapi.put(`/compliance/numbers/${numberId}/header`, { status });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the header status.');
    } finally {
      setBusy(null);
    }
  };

  const setInboundAgent = async (numberId: string, agentId: string) => {
    setBusy(numberId);
    try {
      await whapi.put(`/compliance/numbers/${numberId}/inbound-agent`, { agentId: agentId || null });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the answering agent.');
    } finally {
      setBusy(null);
    }
  };

  const carrierByNumber = new Map(carrier.map(c => [c.phoneNumber, c]));
  const all = [...owned, ...verified];
  const needsHeader = carrier.filter(c => c.headerStatus !== 'REGISTERED').length;

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
          <RzStat label="TOTAL NUMBERS" value={loading ? '—' : all.length + unavailable.length} />
          <RzStat label="PLATFORM" value={loading ? '—' : owned.length} color="var(--cyan-fg)" />
          <RzStat label="VERIFIED OWN" value={loading ? '—' : verified.length} color="var(--lime)" />
          {/* Both of these appear only when there is something wrong — a permanent
              "0 suspended" tile trains people to ignore the row it lives in. */}
          {!loading && needsHeader > 0 && (
            <RzStat label="NEEDS DLT HEADER" value={needsHeader} color="var(--warn, #f59e0b)" />
          )}
          {!loading && unavailable.length > 0 && (
            <RzStat label="SUSPENDED" value={unavailable.length} color="var(--err)" />
          )}
        </div>

        {/* Suspended inventory, above the working list: it is the thing the
            client came here to understand. */}
        {!loading && unavailable.length > 0 && (
          <div className="rz-stack-sm" style={{ marginBottom: 18 }}>
            {unavailable.map(n => (
              <div
                key={n.phoneNumber}
                className="rz-card"
                style={{
                  padding: '16px 18px', borderRadius: 13, display: 'flex', alignItems: 'center',
                  gap: 16, flexWrap: 'wrap',
                  background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.28)',
                }}
              >
                <span style={{ fontSize: 20 }} aria-hidden>{flagFor(n.phoneNumber)}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="rz-title-lg" style={{ fontFamily: 'var(--ff-m)', letterSpacing: '-0.3px' }}>
                    {n.phoneNumber}
                  </div>
                  <div className="rz-sub" style={{ fontSize: 12.5, marginTop: 3 }}>{n.reason}</div>
                </div>
                {n.actionLink && (
                  <Link className="rz-btn rz-btn-primary rz-btn-sm" to={n.actionLink}>
                    {n.actionText ?? 'Fix'}
                  </Link>
                )}
                <RzPill tone="err">Suspended</RzPill>
              </div>
            ))}
          </div>
        )}

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
        ) : all.length === 0 && unavailable.length === 0 ? (
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
            {all.map(n => {
              const c = carrierByNumber.get(n.phoneNumber);
              const header = c ? HEADER_VIEW[c.headerStatus] : null;
              return (
                <div
                  key={n.phoneNumber}
                  className="rz-card"
                  style={{ padding: '16px 18px', borderRadius: 13 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 20 }} aria-hidden>{flagFor(n.phoneNumber)}</span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div className="rz-title-lg" style={{ fontFamily: 'var(--ff-m)', letterSpacing: '-0.3px' }}>{n.phoneNumber}</div>
                      <div className="rz-mono-xs">
                        {regionFor(n.phoneNumber)} · voice
                        {c?.clientMonthlyCents ? ` · ₹${Math.round(c.clientMonthlyCents / 100).toLocaleString('en-IN')}/mo` : ''}
                      </div>
                    </div>
                    {!c && (
                      <div style={{ textAlign: 'right' }}>
                        <div className="rz-sub" style={{ fontSize: 12.5 }}>{n.label || '—'}</div>
                        <div className="rz-mono-xs">label</div>
                      </div>
                    )}
                    {header && <RzPill tone={header.tone}>{header.label}</RzPill>}
                    <RzPill tone={n.source === 'own' ? 'ok' : 'info'}>{sourceLabel(n.source)}</RzPill>
                  </div>

                  {/* Only numbers WE rent have a DLT header or an inbound route.
                      A Twilio number has neither, so it keeps the plain row. */}
                  {c && (
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14, display: 'grid', gap: 14 }}>
                      <div>
                        <div className="rz-label" style={{ marginBottom: 6 }}>DLT HEADER</div>
                        {header?.text && (
                          <p className="rz-sub" style={{ fontSize: 12.5, margin: '0 0 9px', maxWidth: 620 }}>{header.text}</p>
                        )}
                        {c.headerStatus === 'REJECTED' && c.headerRejectionReason && (
                          <p className="rz-field-error" style={{ margin: '0 0 9px' }}>{c.headerRejectionReason}</p>
                        )}
                        <div className="rz-cluster-sm" style={{ gap: 8, flexWrap: 'wrap' }}>
                          {/* The client reports what their operator decided — we
                              have no API into any DLT portal to check it. */}
                          {c.headerStatus !== 'SUBMITTED' && c.headerStatus !== 'REGISTERED' && (
                            <button
                              className="rz-btn rz-btn-secondary rz-btn-sm"
                              disabled={busy === c.id}
                              onClick={() => void setHeader(c.id, 'SUBMITTED')}
                            >
                              I have submitted it
                            </button>
                          )}
                          {c.headerStatus !== 'REGISTERED' && (
                            <button
                              className="rz-btn rz-btn-primary rz-btn-sm"
                              disabled={busy === c.id}
                              onClick={() => void setHeader(c.id, 'REGISTERED')}
                            >
                              It has been approved
                            </button>
                          )}
                          {c.headerStatus === 'SUBMITTED' && (
                            <button
                              className="rz-btn rz-btn-ghost rz-btn-sm"
                              disabled={busy === c.id}
                              onClick={() => void setHeader(c.id, 'REJECTED')}
                            >
                              It was rejected
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="rz-label" style={{ marginBottom: 6 }}>WHO ANSWERS CALLS TO THIS NUMBER</div>
                        <div className="rz-cluster-sm" style={{ gap: 10, flexWrap: 'wrap' }}>
                          <select
                            className="rz-input"
                            style={{ maxWidth: 260 }}
                            value={c.inboundAgentId ?? ''}
                            disabled={busy === c.id || agents.length === 0}
                            onChange={e => void setInboundAgent(c.id, e.target.value)}
                          >
                            <option value="">Nobody — callers hear "not in service"</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          {agents.length === 0 && (
                            <Link className="rz-btn rz-btn-ghost rz-btn-sm" to="/dashboard">Create an agent first</Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Acquire */}
        <div className="rz-grid-2" style={{ marginTop: 22 }}>
          <RzCard title="Get a number" label="New">
            {/*
              This used to promise a number "in a few seconds" and link to
              /contact. Both were wrong: Indian telecom rules require a
              per-business KYC application that the carrier reviews by hand
              before it will sell a number at all, so the honest entry point is
              the verification flow and the honest timeline is days.
            */}
            <p className="rz-sub" style={{ margin: '0 0 14px' }}>
              Indian numbers are issued to a verified business. Complete verification once and we
              allocate a number in the series your call type allows.
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
            <Link className="rz-btn rz-btn-primary rz-btn-block" to="/number_verification">
              {carrier.length ? 'Get another number →' : 'Start verification →'}
            </Link>
          </RzCard>

          <RzCard title="Bring your own">
            <p className="rz-sub" style={{ margin: '0 0 14px' }}>
              Already have a provider? Verify a number you control and your agents can dial out from it.
            </p>
            <div className="rz-stack-sm">
              {[
                { label: 'Import from Twilio', to: '/integrations' },
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
