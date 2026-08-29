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
  /** How many clients are billed on this tier right now. */
  workspaceCount: number;
};

type WsRow = {
  id: string; name: string; slug: string;
  rateOverrideInr: number | null;
  pricingBucketId: string | null;
  pricingBucket: { id: string; label: string; perMinuteInr: number } | null;
};

/** The shape sent to PATCH /pricing/buckets/:id — only the changed fields. */
type BucketPatch = Partial<Pick<Bucket, 'label' | 'minutes' | 'perMinuteInr' | 'active'>>;

const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', background: 'var(--s2)',
  border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--tx)',
  fontFamily: 'var(--ff-b)', fontSize: 13,
};

const fieldLabel: React.CSSProperties = {
  display: 'block', color: 'var(--tx-3)', fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 4,
};

const primaryButton = (enabled: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: '1px solid var(--teal, var(--cyan-fg))',
  background: enabled ? 'var(--teal, var(--cyan-fg))' : 'transparent',
  color: enabled ? 'var(--on-cyan)' : 'var(--teal, var(--cyan-fg))',
  cursor: enabled ? 'pointer' : 'default',
  opacity: enabled ? 1 : 0.5,
});

/** The ₹ figure a tier is worth at a given rate — what a salesperson quotes. */
const worth = (minutes: number, rate: number) =>
  `${minutes.toLocaleString('en-IN')} min = ₹${Math.round(minutes * rate).toLocaleString('en-IN')}`;

/** "3 clients" / "1 client" / "No clients", for the tier row and its warnings. */
const clientCount = (n: number) => (n === 1 ? '1 client' : `${n} clients`);

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

/**
 * One tier, fully editable.
 *
 * Local input state so typing does not refetch the client table below, and so a
 * half-typed rate is never sent. Everything commits together on Save: editing a
 * tier's price changes what every client on it pays from their next call, and
 * that should be one deliberate action, not a side effect of tabbing out of a
 * field.
 */
function BucketRow({ bucket, busy, onSave }: {
  bucket: Bucket; busy: boolean; onSave: (patch: BucketPatch) => void;
}) {
  const [label, setLabel] = useState(bucket.label);
  const [minutes, setMinutes] = useState(String(bucket.minutes));
  const [rate, setRate] = useState(String(bucket.perMinuteInr));
  const [active, setActive] = useState(bucket.active);

  // Re-sync when the parent reloads after a save, so the inputs show what the
  // server actually stored rather than what was typed at it.
  useEffect(() => {
    setLabel(bucket.label);
    setMinutes(String(bucket.minutes));
    setRate(String(bucket.perMinuteInr));
    setActive(bucket.active);
  }, [bucket.label, bucket.minutes, bucket.perMinuteInr, bucket.active]);

  const parsedRate = Number(rate);
  const parsedMinutes = Number(minutes);
  const trimmedLabel = label.trim();

  const valid = Number.isFinite(parsedRate) && parsedRate > 0
    && Number.isInteger(parsedMinutes) && parsedMinutes > 0
    && trimmedLabel.length > 0;

  // Send only what changed, so a save that merely flips `active` cannot also
  // resubmit the rate and read as a reprice in the logs.
  const patch: BucketPatch = {};
  if (trimmedLabel !== bucket.label) patch.label = trimmedLabel;
  if (parsedMinutes !== bucket.minutes) patch.minutes = parsedMinutes;
  if (parsedRate !== bucket.perMinuteInr) patch.perMinuteInr = parsedRate;
  if (active !== bucket.active) patch.active = active;

  const dirty = valid && Object.keys(patch).length > 0;
  const repricing = patch.perMinuteInr !== undefined && bucket.workspaceCount > 0;
  const retiring = patch.active === false;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: bucket.active ? 1 : 0.72,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 190px', minWidth: 160 }}>
          <span style={fieldLabel}>Tier name</span>
          <input value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} style={input} />
        </div>

        <div style={{ width: 120 }}>
          <span style={fieldLabel}>Minutes</span>
          <input
            type="number" step="1" min="1" value={minutes} disabled={busy}
            onChange={(e) => setMinutes(e.target.value)}
            style={input}
          />
        </div>

        <div style={{ width: 150 }}>
          <span style={fieldLabel}>Rate</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--tx-2)' }}>&#8377;</span>
            <input
              type="number" step="0.01" min="0.01" value={rate} disabled={busy}
              onChange={(e) => setRate(e.target.value)}
              style={input}
            />
            <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>/min</span>
          </div>
        </div>

        <button onClick={() => onSave(patch)} disabled={!dirty || busy} style={primaryButton(dirty && !busy)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--tx-3)' }}>
          {valid ? worth(parsedMinutes, parsedRate) : 'Fill in every field to price this tier'}
        </span>

        <span style={{ color: 'var(--tx-3)' }}>
          {bucket.workspaceCount === 0 ? 'No clients' : clientCount(bucket.workspaceCount)}
        </span>

        {/*
          `active` governs whether the tier is OFFERED, never whether it bills.
          Retiring one leaves everybody on it at the price they agreed — see the
          note in services/billing/workspaceRate.js. The picker below stops
          listing it, which is the whole of what this flag does.
        */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--tx-2)', cursor: busy ? 'default' : 'pointer',
        }}>
          <input type="checkbox" checked={active} disabled={busy} onChange={(e) => setActive(e.target.checked)} />
          Offer to new clients
        </label>
      </div>

      {/* Warned BEFORE the save rather than reported after it, because both of
          these are irreversible in the only sense that matters here: somebody's
          next call is billed differently. */}
      {(repricing || retiring) && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--warn, var(--tx-2))', lineHeight: 1.5 }}>
          {repricing && `Saving reprices ${clientCount(bucket.workspaceCount)} from their next call. `}
          {retiring && (bucket.workspaceCount === 0
            ? 'Retiring hides this tier from the picker.'
            : `Retiring hides this tier from the picker; the ${clientCount(bucket.workspaceCount)} on it stay at this price until reassigned.`)}
        </p>
      )}

      {!bucket.active && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--tx-3)' }}>
          Retired — not offered to new clients. Still billing anyone already assigned.
        </p>
      )}
    </div>
  );
}

/**
 * Add a tier.
 *
 * Collapsed until asked for: adding a tier is rare next to repricing one, and
 * an always-open form invites a stray submit on a page where every other
 * control moves money. A new tier starts assigned to nobody, so this is the one
 * action on this page that cannot change an existing client's bill.
 */
function NewBucketForm({ busy, onCreate }: {
  busy: boolean;
  onCreate: (input: { label: string; minutes: number; perMinuteInr: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState('');
  const [rate, setRate] = useState('');

  const parsedMinutes = Number(minutes);
  const parsedRate = Number(rate);
  const valid = Number.isInteger(parsedMinutes) && parsedMinutes > 0
    && Number.isFinite(parsedRate) && parsedRate > 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8,
          border: '1px dashed var(--line-2)', background: 'transparent',
          color: 'var(--tx-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + Add a tier
      </button>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--line-2)', borderRadius: 10, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 190px', minWidth: 160 }}>
          <span style={fieldLabel}>Tier name</span>
          <input
            value={label} disabled={busy} placeholder="defaults to the minutes"
            onChange={(e) => setLabel(e.target.value)}
            style={input}
          />
        </div>

        <div style={{ width: 120 }}>
          <span style={fieldLabel}>Minutes</span>
          <input
            type="number" step="1" min="1" value={minutes} disabled={busy}
            onChange={(e) => setMinutes(e.target.value)}
            style={input}
          />
        </div>

        <div style={{ width: 150 }}>
          <span style={fieldLabel}>Rate</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--tx-2)' }}>&#8377;</span>
            <input
              type="number" step="0.01" min="0.01" value={rate} disabled={busy}
              onChange={(e) => setRate(e.target.value)}
              style={input}
            />
            <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>/min</span>
          </div>
        </div>

        <button
          onClick={() => onCreate({ label: label.trim(), minutes: parsedMinutes, perMinuteInr: parsedRate })}
          disabled={!valid || busy}
          style={primaryButton(valid && !busy)}
        >
          {busy ? 'Adding…' : 'Add tier'}
        </button>

        <button
          onClick={() => { setLabel(''); setMinutes(''); setRate(''); setOpen(false); }}
          disabled={busy}
          style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--line-2)', background: 'transparent',
            color: 'var(--tx-3)', cursor: busy ? 'default' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>

      <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>
        {valid
          ? `${worth(parsedMinutes, parsedRate)}. Starts assigned to nobody.`
          : 'Enter the minutes this tier quotes and the rate it charges.'}
      </span>
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

  const saveBucket = async (b: Bucket, patch: BucketPatch) => {
    setBusy(b.id); setMsg(null);
    try {
      const res = await authFetch(API(`/pricing/buckets/${b.id}`), {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      // Repricing a tier changes what every client on it pays from their NEXT
      // call. Already-settled calls keep the rate recorded on their log row.
      setMsg(patch.perMinuteInr !== undefined
        ? `${data.bucket.label} is now ₹${data.bucket.perMinuteInr}/min. Clients on this tier are charged the new rate from their next call.`
        : `${data.bucket.label} saved.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally { setBusy(null); }
  };

  const createBucket = async (body: { label: string; minutes: number; perMinuteInr: number }) => {
    setBusy('new'); setMsg(null);
    try {
      const res = await authFetch(API('/pricing/buckets'), {
        method: 'POST', body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add the tier');
      setMsg(`${data.bucket.label} added at ₹${data.bucket.perMinuteInr}/min. Assign it to a client below.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add the tier');
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
              onSave={(patch) => saveBucket(b, patch)}
            />
          ))}
          <NewBucketForm busy={busy === 'new'} onCreate={createBucket} />
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
                // A retired tier stays listed only for the clients already on it,
                // so this dropdown can never silently drop somebody's current
                // tier — but nobody new can be moved onto one.
                const offered = buckets.filter((b) => b.active || b.id === w.pricingBucketId);
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
                        {offered.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label} · ₹{b.perMinuteInr}{b.active ? '' : ' (retired)'}
                          </option>
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
