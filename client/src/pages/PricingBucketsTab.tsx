// client/src/pages/PricingBucketsTab.tsx
/**
 * Super Admin → Pricing. Volume tiers, and what each client actually pays.
 *
 * ADMIN-ONLY, and deliberately so. Nothing here is rendered anywhere a customer
 * can reach, and the public site quotes no price at all — this deployment is
 * contact-led. Keep it that way: a bucket is a sales instrument, not a pricing
 * page. There is no customer-facing endpoint behind any of this.
 *
 * A tier is a PRICE, not an allowance. The minutes in its name are what a
 * salesperson quotes against; nothing decrements them, nothing expires, and
 * running "out" is not a state that exists. The wallet balance remains the only
 * thing that gates a call.
 */
import { useEffect, useState } from 'react';
import { API } from '@/lib/adminApi';
import { authFetch } from '@/lib/authFetch';

type Bucket = {
  id: string; name: string; label: string;
  minutes: number; perMinuteInr: number; active: boolean;
};

type WsRow = {
  id: string; name: string; slug: string;
  rateOverrideInr: number | null;
  pricingBucketId: string | null;
  pricingBucket: { id: string; label: string; perMinuteInr: number } | null;
};

const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', background: 'var(--s2)',
  border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--tx)',
  fontFamily: 'var(--ff-b)', fontSize: 13,
};

/**
 * Mirrors pickRate() in backend/src/services/billing/workspaceRate.js.
 * Kept deliberately in step: if this and the server ever disagree, the table
 * shows an admin a price the customer is not actually charged, which is worse
 * than showing nothing. Same order, same zero/NaN fall-through.
 */
const effectiveRate = (w: WsRow, fallback: number): { rate: number; source: string } => {
  if (w.rateOverrideInr && w.rateOverrideInr > 0) return { rate: w.rateOverrideInr, source: 'Override' };
  if (w.pricingBucket && w.pricingBucket.perMinuteInr > 0) {
    return { rate: w.pricingBucket.perMinuteInr, source: w.pricingBucket.label };
  }
  return { rate: fallback, source: 'Default' };
};

/** One tier. Local input state so typing does not refetch the client table. */
function BucketRow({ bucket, busy, onSave }: {
  bucket: Bucket; busy: boolean; onSave: (rate: number) => void;
}) {
  const [val, setVal] = useState(String(bucket.perMinuteInr));
  useEffect(() => { setVal(String(bucket.perMinuteInr)); }, [bucket.perMinuteInr]);

  const parsed = Number(val);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const dirty = valid && parsed !== bucket.perMinuteInr;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 150 }}>
        <div style={{ color: 'var(--tx)', fontSize: 14, fontWeight: 600 }}>{bucket.label}</div>
        <div style={{ color: 'var(--tx-3)', fontSize: 11 }}>
          {bucket.minutes.toLocaleString('en-IN')} min tier
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--tx-2)' }}>&#8377;</span>
        <input
          type="number" step="0.01" min="0.01" value={val} disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          style={{ ...input, maxWidth: 110 }}
        />
        <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>/ min</span>
      </div>

      {/* The number a salesperson actually quotes: what the tier is worth. */}
      <div style={{ color: 'var(--tx-3)', fontSize: 12, flex: 1, minWidth: 150 }}>
        {valid && `${bucket.minutes.toLocaleString('en-IN')} min = ₹${(bucket.minutes * parsed).toLocaleString('en-IN')}`}
      </div>

      <button
        onClick={() => onSave(parsed)} disabled={!dirty || busy}
        style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          border: '1px solid var(--teal, var(--cyan-fg))',
          background: dirty ? 'var(--teal, var(--cyan-fg))' : 'transparent',
          color: dirty ? 'var(--on-cyan)' : 'var(--teal, var(--cyan-fg))',
          cursor: dirty && !busy ? 'pointer' : 'default',
          opacity: dirty || busy ? 1 : 0.5,
        }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default function PricingBucketsTab({ defaultRate }: { defaultRate?: number | null } = {}) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [rows, setRows] = useState<WsRow[]>([]);
  const [fallback, setFallback] = useState(12);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');

  // The default-rate editor sits above this table on the same page. When it
  // saves, the number this table calls "Default" changes, so take it from the
  // parent rather than waiting for a remount to refetch /wallet-rate.
  useEffect(() => {
    if (typeof defaultRate === 'number' && defaultRate > 0) setFallback(defaultRate);
  }, [defaultRate]);

  const load = async () => {
    try {
      const [b, w, r] = await Promise.all([
        authFetch(API('/pricing/buckets')).then((x) => x.json()),
        authFetch(API('/workspaces')).then((x) => x.json()),
        authFetch(API('/wallet-rate')).then((x) => x.json()),
      ]);
      if (b.error) throw new Error(b.error);
      setBuckets(b.buckets || []);
      setRows(w.workspaces || []);
      if (r.perMinuteInr) setFallback(Number(r.perMinuteInr));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load pricing');
    }
  };
  useEffect(() => { load(); }, []);

  const saveBucket = async (b: Bucket, perMinuteInr: number) => {
    setBusy(b.id); setMsg(null);
    try {
      const res = await authFetch(API(`/pricing/buckets/${b.id}`), {
        method: 'PATCH', body: JSON.stringify({ perMinuteInr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      // Repricing a tier changes what every client on it pays from their NEXT
      // call. Already-settled calls keep the rate recorded on their log row.
      setMsg(`${data.bucket.label} is now ₹${data.bucket.perMinuteInr}/min. Clients on this tier are charged the new rate from their next call.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally { setBusy(null); }
  };

  const assign = async (workspaceId: string, bucketId: string | null) => {
    setBusy(workspaceId); setMsg(null);
    try {
      const res = await authFetch(API(`/pricing/workspaces/${workspaceId}/bucket`), {
        method: 'PUT', body: JSON.stringify({ bucketId }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(null); }
  };

  const setOverride = async (workspaceId: string, value: string) => {
    setBusy(workspaceId); setMsg(null);
    try {
      const perMinuteInr = value.trim() === '' ? null : Number(value);
      const res = await authFetch(API(`/pricing/workspaces/${workspaceId}/override`), {
        method: 'PUT', body: JSON.stringify({ perMinuteInr }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(null); }
  };

  if (err) return <p style={{ color: 'var(--err)' }}>Couldn&apos;t load pricing: {err}</p>;

  const filtered = rows.filter((w) => !q
    || w.name.toLowerCase().includes(q.toLowerCase())
    || w.slug.toLowerCase().includes(q.toLowerCase()));

  const cell: React.CSSProperties = {
    padding: '9px 10px', borderBottom: '1px solid var(--line)',
    fontSize: 13, color: 'var(--tx-2)',
  };
  const head: React.CSSProperties = {
    ...cell, color: 'var(--tx-3)', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <p style={{ color: 'var(--tx-3)', fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 760 }}>
        Volume tiers you can assign to a client. A tier is a <strong>price</strong>, not an
        allowance — the minutes in its name are what you quote against, never a quota, and
        nothing is decremented or expires. The wallet balance is still the only thing that
        gates a call. None of this is shown to clients anywhere.
      </p>

      <div>
        <h3 style={{ fontSize: 13, color: 'var(--tx)', margin: '0 0 10px' }}>Tiers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {buckets.map((b) => (
            <BucketRow
              key={b.id} bucket={b} busy={busy === b.id}
              onSave={(rate) => saveBucket(b, rate)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 13, color: 'var(--tx)', margin: '0 0 4px' }}>Client pricing</h3>
        <p style={{ color: 'var(--tx-3)', fontSize: 12, margin: '0 0 10px' }}>
          An override beats the tier; a client with neither pays the default (&#8377;{fallback}/min).
          Clear the override box to fall back to the tier.
        </p>

        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
          style={{ ...input, maxWidth: 280, marginBottom: 12 }}
        />

        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'left' }}>Client</th>
                <th style={{ ...head, textAlign: 'left' }}>Tier</th>
                <th style={{ ...head, textAlign: 'left' }}>Override</th>
                <th style={{ ...head, textAlign: 'right' }}>Pays</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const eff = effectiveRate(w, fallback);
                return (
                  <tr key={w.id} style={{ opacity: busy === w.id ? 0.5 : 1 }}>
                    <td style={cell}>
                      <div style={{ color: 'var(--tx)' }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{w.slug}</div>
                    </td>
                    <td style={cell}>
                      <select
                        value={w.pricingBucketId || ''} disabled={busy === w.id}
                        onChange={(e) => assign(w.id, e.target.value || null)}
                        style={{ ...input, maxWidth: 180, padding: '6px 8px' }}
                      >
                        <option value="">— none —</option>
                        {buckets.map((b) => (
                          <option key={b.id} value={b.id}>{b.label} · ₹{b.perMinuteInr}</option>
                        ))}
                      </select>
                    </td>
                    <td style={cell}>
                      {/* onBlur, not onChange: committing per keystroke would fire a
                          write (and a reprice) for every digit typed. */}
                      <input
                        type="number" step="0.01" min="0.01" placeholder="—"
                        defaultValue={w.rateOverrideInr ?? ''} disabled={busy === w.id}
                        onBlur={(e) => {
                          const next = e.target.value;
                          const current = w.rateOverrideInr === null ? '' : String(w.rateOverrideInr);
                          if (next !== current) setOverride(w.id, next);
                        }}
                        style={{ ...input, maxWidth: 100, padding: '6px 8px' }}
                      />
                    </td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <div style={{ color: 'var(--tx)', fontWeight: 600 }}>&#8377;{eff.rate}/min</div>
                      <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{eff.source}</div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td style={{ ...cell, color: 'var(--tx-3)' }} colSpan={4}>
                    No clients match &quot;{q}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {msg && <p style={{ fontSize: 12, color: 'var(--tx-2)', margin: 0 }}>{msg}</p>}
    </div>
  );
}
