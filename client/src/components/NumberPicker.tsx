import { useCallback, useEffect, useState } from 'react';
import { whapi } from '@/lib/whapi';
import { RzCard, RzEmpty, RzPill, RzSkeleton } from '@/components/rz';

/**
 * Picking a phone number, once the carrier has verified the business.
 *
 * Two things shape this screen and neither is a UI decision:
 *
 *   Nothing here is reserved. Plivo has no hold mechanism, so a number on this
 *   list can be gone by the time it is picked. The copy says so rather than
 *   letting it read as a shopping cart, and a failure at that point is an
 *   ordinary outcome, not an error to apologise for.
 *
 *   Picking may not be buying. Renting spends real money on the platform's own
 *   carrier account, and that path has never run against a live Plivo account,
 *   so PLIVO_SELF_SERVE_RENT decides whether a pick rents the number or asks a
 *   human to. The server answers that (`selfServe`); this component never
 *   guesses, because guessing wrong means either a dead button or a surprise
 *   charge.
 *
 * The series shown is fixed by the workspace's declared call type — see
 * backend/src/services/plivo/number.service.js#searchPatternFor.
 */

interface AvailableNumber {
  phoneNumber: string;
  city: string | null;
  region: string | null;
  series: string | null;
}

interface Pricing {
  setupCents: number;
  monthlyCents: number;
  dueNowCents: number;
  currency: string;
}

interface SearchResult {
  ok: boolean;
  useCase: 'PROMOTIONAL' | 'TRANSACTIONAL' | null;
  numbers: AvailableNumber[];
  pricing: Pricing;
  total: number | null;
}

interface NumberRequest {
  id: string;
  phoneNumber: string;
  status: 'PENDING' | 'FULFILLED' | 'DECLINED' | 'CANCELLED';
  note: string | null;
  resolution: string | null;
  createdAt: string;
}

const rupees = (cents: number) =>
  `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;

const SERIES_LABEL: Record<string, string> = {
  PROMOTIONAL_140: '140 · promotional',
  TRANSACTIONAL_LANDLINE: 'Landline · service',
  BFSI_1600: '1600 · BFSI',
};

const REQUEST_TONE: Record<NumberRequest['status'], 'warn' | 'ok' | 'err' | 'idle'> = {
  PENDING: 'warn',
  FULFILLED: 'ok',
  DECLINED: 'err',
  CANCELLED: 'idle',
};

export default function NumberPicker({ onAllocated }: { onAllocated?: () => void }) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [requests, setRequests] = useState<NumberRequest[]>([]);
  const [selfServe, setSelfServe] = useState(false);
  const [pattern, setPattern] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AvailableNumber | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const r = await whapi.get<{ selfServe: boolean; requests: NumberRequest[] }>(
        '/compliance/numbers/requests',
      );
      setSelfServe(r.selfServe);
      setRequests(r.requests ?? []);
    } catch {
      /* The picker is still usable without the request list. */
    }
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (pattern.trim()) qs.set('pattern', pattern.trim());
      if (city.trim()) qs.set('city', city.trim());
      const q = qs.toString();
      setResult(await whapi.get<SearchResult>(`/compliance/numbers/available${q ? `?${q}` : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load available numbers.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [pattern, city]);

  useEffect(() => { void search(); void loadRequests(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const take = async (n: AvailableNumber) => {
    setBusy(n.phoneNumber);
    setError(null);
    setNotice(null);
    try {
      if (selfServe) {
        await whapi.post('/compliance/numbers/rent', { phoneNumber: n.phoneNumber });
        setNotice(`${n.phoneNumber} is yours. Register it as a DLT header before you dial from it.`);
        onAllocated?.();
      } else {
        await whapi.post('/compliance/numbers/requests', { phoneNumber: n.phoneNumber });
        setNotice(`We have your request for ${n.phoneNumber}. We will email you once it is set up.`);
      }
      setConfirming(null);
      await Promise.all([loadRequests(), search()]);
    } catch (e) {
      // The commonest failure is someone else taking the number first, which is
      // not an error the client did anything to cause.
      setError(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await whapi.delete(`/compliance/numbers/requests/${id}`);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel that request.');
    } finally {
      setBusy(null);
    }
  };

  const pricing = result?.pricing;
  const pending = requests.filter(r => r.status === 'PENDING');
  const resolved = requests.filter(r => r.status !== 'PENDING').slice(0, 3);

  return (
    <RzCard title="Choose your number" label="STEP 5">
      <p className="rz-sub" style={{ margin: '0 0 16px', fontSize: 12.5, maxWidth: 660 }}>
        These are live from the carrier and are not held for you — a number can be taken by someone
        else before you pick it.{' '}
        {result?.useCase === 'PROMOTIONAL'
          ? 'Your workspace is declared for promotional calls, so only 140-series numbers are shown.'
          : 'Your workspace is declared for service and transactional calls, so landline numbers are shown.'}
      </p>

      {pricing && (
        <div
          className="rz-card"
          style={{
            padding: 14, borderRadius: 11, marginBottom: 16,
            background: 'rgba(14,179,158,0.05)', borderColor: 'rgba(14,179,158,0.28)',
          }}
        >
          <div className="rz-title" style={{ fontSize: 13.5, marginBottom: 4 }}>
            {rupees(pricing.dueNowCents)} today, then {rupees(pricing.monthlyCents)} a month
          </div>
          <p className="rz-sub" style={{ fontSize: 12, margin: 0 }}>
            {pricing.setupCents > 0
              ? `${rupees(pricing.setupCents)} one-time setup plus the first month, taken from your wallet.`
              : 'The first month is taken from your wallet now; the rest renews monthly.'}{' '}
            The number stays yours until you release it.
          </p>
        </div>
      )}

      {/* Open requests first — this is what the client came back to check. */}
      {pending.length > 0 && (
        <div className="rz-stack-sm" style={{ marginBottom: 16 }}>
          {pending.map(r => (
            <div
              key={r.id}
              className="rz-card"
              style={{ padding: '12px 14px', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              <RzPill tone="warn" dot>Requested</RzPill>
              <span className="rz-mono" style={{ flex: 1, minWidth: 140 }}>{r.phoneNumber}</span>
              <span className="rz-sub" style={{ fontSize: 12 }}>We are setting this up for you.</span>
              <button
                className="rz-btn rz-btn-ghost rz-btn-sm"
                disabled={busy === r.id}
                onClick={() => void cancel(r.id)}
              >
                {busy === r.id ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="rz-stack-sm" style={{ marginBottom: 16 }}>
          {resolved.map(r => (
            <div key={r.id} className="rz-between" style={{ gap: 12, fontSize: 12.5, flexWrap: 'wrap' }}>
              <span className="rz-cluster-sm" style={{ gap: 8 }}>
                <RzPill tone={REQUEST_TONE[r.status]}>{r.status.toLowerCase()}</RzPill>
                <span className="rz-mono-xs">{r.phoneNumber}</span>
              </span>
              {r.resolution && <span className="rz-sub" style={{ fontSize: 12 }}>{r.resolution}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="rz-cluster-sm" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          className="rz-input"
          style={{ maxWidth: 190 }}
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void search(); }}
          placeholder={result?.useCase === 'PROMOTIONAL' ? '140…' : 'STD code, e.g. 22'}
          aria-label="Number prefix"
        />
        <input
          className="rz-input"
          style={{ maxWidth: 190 }}
          value={city}
          onChange={e => setCity(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void search(); }}
          placeholder="City, e.g. Mumbai"
          aria-label="City"
        />
        <button className="rz-btn rz-btn-secondary" disabled={loading} onClick={() => void search()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <div
            className="rz-card"
            style={{
              padding: '10px 13px', borderRadius: 10, fontSize: 12.5,
              background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)', color: 'var(--err)',
            }}
          >
            {error}
          </div>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 14 }}>
          <div
            className="rz-card"
            style={{
              padding: '10px 13px', borderRadius: 10, fontSize: 12.5,
              background: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.3)',
            }}
          >
            {notice}
          </div>
        </div>
      )}

      {loading ? (
        <RzSkeleton rows={4} height={56} />
      ) : !result?.numbers.length ? (
        <RzEmpty
          title="No numbers match"
          text="The carrier has nothing available on those filters right now. Try a different city or prefix — inventory changes daily."
        />
      ) : (
        <div className="rz-stack-sm">
          {result.numbers.map(n => {
            const isConfirming = confirming?.phoneNumber === n.phoneNumber;
            return (
              <div
                key={n.phoneNumber}
                className="rz-card"
                style={{
                  padding: '14px 16px', borderRadius: 12,
                  borderColor: isConfirming ? 'rgba(14,179,158,0.4)' : undefined,
                  background: isConfirming ? 'rgba(14,179,158,0.05)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div className="rz-title-lg" style={{ fontFamily: 'var(--ff-m)', letterSpacing: '-0.3px' }}>
                      {n.phoneNumber}
                    </div>
                    <div className="rz-mono-xs">
                      {[n.city, n.region].filter(Boolean).join(' · ') || 'India'}
                      {n.series ? ` · ${SERIES_LABEL[n.series] ?? n.series}` : ''}
                    </div>
                  </div>
                  {!isConfirming && (
                    <button
                      className="rz-btn rz-btn-primary rz-btn-sm"
                      disabled={Boolean(busy)}
                      onClick={() => { setConfirming(n); setError(null); setNotice(null); }}
                    >
                      {selfServe ? 'Take this number' : 'Request this number'}
                    </button>
                  )}
                </div>

                {/* The confirmation says what happens and what it costs. A wallet
                    debit that arrives unannounced is a support ticket. */}
                {isConfirming && (
                  <div style={{ marginTop: 13, borderTop: '1px solid var(--line)', paddingTop: 13 }}>
                    <p className="rz-sub" style={{ margin: '0 0 12px', fontSize: 12.5 }}>
                      {selfServe && pricing
                        ? `${rupees(pricing.dueNowCents)} will be taken from your wallet now, then ${rupees(pricing.monthlyCents)} every month. You still need to register this number as a DLT header before calls will connect.`
                        : 'We will set this number up for you and email you when it is ready. Nothing is charged until it is allocated, and the number is not held in the meantime.'}
                    </p>
                    <div className="rz-cluster-sm" style={{ gap: 9 }}>
                      <button
                        className="rz-btn rz-btn-primary rz-btn-sm"
                        disabled={busy === n.phoneNumber}
                        onClick={() => void take(n)}
                      >
                        {busy === n.phoneNumber
                          ? (selfServe ? 'Allocating…' : 'Sending…')
                          : (selfServe ? `Confirm — ${pricing ? rupees(pricing.dueNowCents) : 'allocate'}` : 'Send request')}
                      </button>
                      <button
                        className="rz-btn rz-btn-ghost rz-btn-sm"
                        disabled={busy === n.phoneNumber}
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </RzCard>
  );
}
