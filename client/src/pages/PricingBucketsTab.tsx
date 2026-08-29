// client/src/pages/PricingBucketsTab.tsx
/**
 * Super Admin → Pricing. Volume tiers, and what each client actually pays.
 *
 * ADMIN-ONLY, and deliberately so. Nothing here is rendered anywhere a customer
 * can reach, and the public site quotes no price at all — this deployment is
 * contact-led. Keep it that way: a bucket is a sales instrument, not a pricing
 * page. There is no customer-facing endpoint behind any of this.
 *
 * A tier prices a BAND of monthly volume — under 200 minutes, 200 to 1,500, and
 * so on. The band is what an admin reads to pick the right tier; it is NOT an
 * allowance and NOT a quota. Nothing is decremented, nothing expires, and the
 * wallet balance is still the only thing that gates a call.
 *
 * NOTHING PICKS A TIER AUTOMATICALLY. A client whose usage outgrows their band
 * keeps their rate until an admin reassigns them here, deliberately. The bands
 * describe; they do not resolve.
 *
 * Bounds are MIN INCLUSIVE, MAX EXCLUSIVE — 1,500 minutes belongs to the
 * 1,500–5,000 tier, not to the one below it.
 */
import { useEffect, useState } from 'react';
import { API } from '@/lib/adminApi';
import { authFetch } from '@/lib/authFetch';

type Bucket = {
  id: string; name: string; label: string;
  /** Band floor, inclusive. */
  minMinutes: number;
  /** Band ceiling, exclusive. null is the open-ended top bracket. */
  maxMinutes: number | null;
  perMinuteInr: number; active: boolean;
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
type BucketPatch = Partial<Pick<Bucket, 'label' | 'minMinutes' | 'maxMinutes' | 'perMinuteInr' | 'active'>>;

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

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const mins = (n: number) => n.toLocaleString('en-IN');

/**
 * What a client in this band spends per month at this rate.
 *
 * The figure a salesperson actually quotes. A band has two ends, so it is a
 * spread rather than one number — and for the open-ended top bracket only a
 * floor, since there is no ceiling to multiply.
 */
const spend = (minMinutes: number, maxMinutes: number | null, rate: number) => (
  maxMinutes === null
    ? `${mins(minMinutes)}+ min = ${inr(minMinutes * rate)}+ / month`
    : `${mins(minMinutes)}–${mins(maxMinutes)} min = ${inr(minMinutes * rate)}–${inr(maxMinutes * rate)} / month`
);

/** A bound as an input value. Empty for the open-ended end, and for absent. */
const bounded = (n: number | null | undefined) => (Number.isFinite(n) ? String(n) : '');

/** "3 clients" / "1 client", for the tier row and its warnings. */
const clientCount = (n: number) => (n === 1 ? '1 client' : `${n} clients`);

/** A bucket whose band this build can actually reason about. */
const hasReadableBand = (b: Bucket) =>
  Number.isFinite(b.minMinutes) && (b.maxMinutes === null || Number.isFinite(b.maxMinutes));

/**
 * Whether the offered bands tile the whole range — no gap, no overlap.
 *
 * Not enforced on the server: nothing resolves a rate from a band, so an
 * overlap is untidy rather than wrong, and refusing one would block the
 * ordinary case of widening a band before narrowing its neighbour. Reported
 * here instead, because an admin who has left 1,500–2,000 uncovered wants to
 * find out now rather than when a customer falls in it.
 *
 * Retired tiers are excluded: they are not offered, so they cannot leave a hole.
 *
 * SAYS NOTHING RATHER THAN GUESSING. A server still on the pre-band shape sends
 * tiers with no bounds at all, and this used to walk straight into them and
 * throw — which, with no error boundary over the admin console, blanked the
 * entire page over a diagnostic that is not even load-bearing. A band it cannot
 * read is a band it cannot judge, so it reports nothing at all.
 */
const bandGaps = (buckets: Bucket[]): string[] => {
  const active = buckets.filter((b) => b.active);
  if (!active.every(hasReadableBand)) return [];

  const offered = [...active].sort((a, b) => a.minMinutes - b.minMinutes);
  if (offered.length === 0) return [];

  const problems: string[] = [];
  if (offered[0].minMinutes > 0) problems.push(`Nothing covers 0–${mins(offered[0].minMinutes)} min.`);

  for (let i = 0; i < offered.length - 1; i += 1) {
    const cur = offered[i];
    const next = offered[i + 1];
    if (cur.maxMinutes === null) {
      problems.push(`${cur.label} is open-ended but ${next.label} sits above it.`);
    } else if (cur.maxMinutes < next.minMinutes) {
      problems.push(`Nothing covers ${mins(cur.maxMinutes)}–${mins(next.minMinutes)} min.`);
    } else if (cur.maxMinutes > next.minMinutes) {
      problems.push(`${cur.label} and ${next.label} both cover ${mins(next.minMinutes)}–${mins(cur.maxMinutes)} min.`);
    }
  }

  const top = offered[offered.length - 1];
  if (top.maxMinutes !== null) problems.push(`Nothing covers volume above ${mins(top.maxMinutes)} min.`);

  return problems;
};

/**
 * Mirrors pickRate() in backend/src/services/billing/workspaceRate.js.
 * Kept deliberately in step: if this and the server ever disagree, the table
 * shows an admin a price the customer is not actually charged, which is worse
 * than showing nothing. Same order, same zero/NaN fall-through.
 *
 * Note what it does NOT consult: the band. Tiers are assigned, never inferred.
 */
const effectiveRate = (w: WsRow, fallback: number): { rate: number; source: string } => {
  if (w.rateOverrideInr && w.rateOverrideInr > 0) return { rate: w.rateOverrideInr, source: 'Override' };
  if (w.pricingBucket && w.pricingBucket.perMinuteInr > 0) {
    return { rate: w.pricingBucket.perMinuteInr, source: w.pricingBucket.label };
  }
  return { rate: fallback, source: 'Default' };
};

/** Shared by the tier row and the create form — a band is two bounded fields. */
function BandFields({ from, to, busy, onFrom, onTo }: {
  from: string; to: string; busy: boolean;
  onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <>
      <div style={{ width: 110 }}>
        <span style={fieldLabel}>From (min)</span>
        <input
          type="number" step="1" min="0" value={from} disabled={busy}
          onChange={(e) => onFrom(e.target.value)}
          style={input}
        />
      </div>

      <div style={{ width: 130 }}>
        <span style={fieldLabel}>To (min)</span>
        <input
          type="number" step="1" min="1" value={to} disabled={busy}
          placeholder="no limit"
          onChange={(e) => onTo(e.target.value)}
          style={input}
        />
      </div>
    </>
  );
}

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
  // Number.isFinite guards rather than a plain String(): a server on the older
  // bucket shape sends no bounds, and String(undefined) would put the literal
  // text "undefined" in a number field.
  const [from, setFrom] = useState(bounded(bucket.minMinutes));
  const [to, setTo] = useState(bounded(bucket.maxMinutes));
  const [rate, setRate] = useState(String(bucket.perMinuteInr));
  const [active, setActive] = useState(bucket.active);

  // Re-sync when the parent reloads after a save, so the inputs show what the
  // server actually stored rather than what was typed at it.
  useEffect(() => {
    setLabel(bucket.label);
    setFrom(bounded(bucket.minMinutes));
    setTo(bounded(bucket.maxMinutes));
    setRate(String(bucket.perMinuteInr));
    setActive(bucket.active);
  }, [bucket.label, bucket.minMinutes, bucket.maxMinutes, bucket.perMinuteInr, bucket.active]);

  const parsedRate = Number(rate);
  const parsedFrom = Number(from);
  // An empty ceiling is the open-ended top bracket, not a missing field.
  const parsedTo = to.trim() === '' ? null : Number(to);
  const trimmedLabel = label.trim();
  const count = Number.isFinite(bucket.workspaceCount) ? bucket.workspaceCount : 0;

  // The empty floor has to be rejected on its own, because `Number('')` is 0
  // and zero is a legal floor — without this an emptied field reads as a band
  // starting at 0, and the row would offer to SAVE that. Mirrors the identical
  // guard in parseMinMinutes on the server; the ceiling is deliberately the
  // opposite, where empty means the open-ended top bracket.
  const valid = from.trim() !== ''
    && Number.isFinite(parsedRate) && parsedRate > 0
    && Number.isInteger(parsedFrom) && parsedFrom >= 0
    && (parsedTo === null || (Number.isInteger(parsedTo) && parsedTo > parsedFrom))
    && trimmedLabel.length > 0;

  // Send only what changed, so a save that merely flips `active` cannot also
  // resubmit the rate and read as a reprice in the logs.
  const patch: BucketPatch = {};
  if (trimmedLabel !== bucket.label) patch.label = trimmedLabel;
  if (parsedFrom !== bucket.minMinutes) patch.minMinutes = parsedFrom;
  if (parsedTo !== bucket.maxMinutes) patch.maxMinutes = parsedTo;
  if (parsedRate !== bucket.perMinuteInr) patch.perMinuteInr = parsedRate;
  if (active !== bucket.active) patch.active = active;

  const dirty = valid && Object.keys(patch).length > 0;
  const repricing = patch.perMinuteInr !== undefined && count > 0;
  const retiring = patch.active === false;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: bucket.active ? 1 : 0.72,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 170px', minWidth: 150 }}>
          <span style={fieldLabel}>Tier name</span>
          <input value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} style={input} />
        </div>

        <BandFields from={from} to={to} busy={busy} onFrom={setFrom} onTo={setTo} />

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
          {valid ? spend(parsedFrom, parsedTo, parsedRate) : 'Fill in every field to price this band'}
        </span>

        <span style={{ color: 'var(--tx-3)' }}>
          {count === 0 ? 'No clients' : clientCount(count)}
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
          {repricing && `Saving reprices ${clientCount(count)} from their next call. `}
          {retiring && (count === 0
            ? 'Retiring hides this tier from the picker.'
            : `Retiring hides this tier from the picker; the ${clientCount(count)} on it stay at this price until reassigned.`)}
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
  onCreate: (input: { label: string; minMinutes: number; maxMinutes: number | null; perMinuteInr: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rate, setRate] = useState('');

  const parsedFrom = Number(from);
  const parsedTo = to.trim() === '' ? null : Number(to);
  const parsedRate = Number(rate);
  const valid = from.trim() !== ''
    && Number.isInteger(parsedFrom) && parsedFrom >= 0
    && (parsedTo === null || (Number.isInteger(parsedTo) && parsedTo > parsedFrom))
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
        <div style={{ flex: '1 1 170px', minWidth: 150 }}>
          <span style={fieldLabel}>Tier name</span>
          <input
            value={label} disabled={busy} placeholder="defaults to the band"
            onChange={(e) => setLabel(e.target.value)}
            style={input}
          />
        </div>

        <BandFields from={from} to={to} busy={busy} onFrom={setFrom} onTo={setTo} />

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
          onClick={() => onCreate({
            label: label.trim(), minMinutes: parsedFrom, maxMinutes: parsedTo, perMinuteInr: parsedRate,
          })}
          disabled={!valid || busy}
          style={primaryButton(valid && !busy)}
        >
          {busy ? 'Adding…' : 'Add tier'}
        </button>

        <button
          onClick={() => { setLabel(''); setFrom(''); setTo(''); setRate(''); setOpen(false); }}
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
          ? `${spend(parsedFrom, parsedTo, parsedRate)}. Starts assigned to nobody.`
          : 'Set where the band starts and what it charges. Leave "to" empty for the top band.'}
      </span>
    </div>
  );
}

export default function PricingBucketsTab({ defaultRate }: { defaultRate?: number | null } = {}) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [rows, setRows] = useState<WsRow[]>([]);
  const [fallback, setFallback] = useState(12);
  const [err, setErr] = useState<string | null>(null);
  // Which half of the page a message belongs to. One shared string used to
  // render at the very bottom of the component — under an 86-row client table
  // — so a failed "Add tier" reported itself entirely off screen and read as
  // the button doing nothing at all.
  const [msg, setMsg] = useState<{ text: string; where: 'tiers' | 'clients' } | null>(null);
  const say = (where: 'tiers' | 'clients') => (text: string) => setMsg({ text, where });
  const sayTiers = say('tiers');
  const sayClients = say('clients');
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
      sayTiers(patch.perMinuteInr !== undefined
        ? `${data.bucket.label} is now ₹${data.bucket.perMinuteInr}/min. Clients on this tier are charged the new rate from their next call.`
        : `${data.bucket.label} saved.`);
      await load();
    } catch (e) {
      sayTiers(e instanceof Error ? e.message : 'Save failed');
    } finally { setBusy(null); }
  };

  const createBucket = async (body: {
    label: string; minMinutes: number; maxMinutes: number | null; perMinuteInr: number;
  }) => {
    setBusy('new'); setMsg(null);
    try {
      const res = await authFetch(API('/pricing/buckets'), {
        method: 'POST', body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add the tier');
      sayTiers(`${data.bucket.label} added at ₹${data.bucket.perMinuteInr}/min. Assign it to a client below.`);
      await load();
    } catch (e) {
      sayTiers(e instanceof Error ? e.message : 'Could not add the tier');
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
      sayClients(e instanceof Error ? e.message : 'Failed');
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
      sayClients(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(null); }
  };

  if (err) return <p style={{ color: 'var(--err)' }}>Couldn&apos;t load pricing: {err}</p>;

  const filtered = rows.filter((w) => !q
    || w.name.toLowerCase().includes(q.toLowerCase())
    || w.slug.toLowerCase().includes(q.toLowerCase()));

  const gaps = bandGaps(buckets);

  // A server on the pre-band build sends tiers with no bounds and has no
  // create route at all, so From/To stay blank and "Add tier" 404s. Both look
  // like the page is broken. Name the actual cause instead: this is the one
  // failure here that no amount of retrying fixes.
  const staleApi = buckets.length > 0 && buckets.some((b) => b.minMinutes === undefined);

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
        Volume tiers you can assign to a client. Each covers a band of monthly minutes and
        sets a <strong>price</strong>, not an allowance — nothing is decremented, nothing
        expires, and the wallet balance is still the only thing that gates a call. A client
        whose usage outgrows their band keeps their rate until you move them here; bands are
        never applied automatically. Bounds include the start and exclude the end, so 1,500
        minutes falls in the 1,500–5,000 band. None of this is shown to clients anywhere.
      </p>

      <div>
        <h3 style={{ fontSize: 13, color: 'var(--tx)', margin: '0 0 10px' }}>Tiers</h3>

        {staleApi && (
          <div style={{
            border: '1px solid var(--line-2)', borderLeft: '3px solid var(--warn, var(--tx-2))',
            borderRadius: 8, padding: '11px 14px', marginBottom: 12,
            fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.6,
          }}>
            <strong>The backend is running an older build than this page.</strong> It is not
            sending tier bands, so From and To stay blank, and it has no route to add a tier.
            Restart the backend — that regenerates the database client, applies the band
            migration and creates the missing bands. Editing a tier&apos;s name or rate still
            works in the meantime.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {buckets.map((b) => (
            <BucketRow
              key={b.id} bucket={b} busy={busy === b.id}
              onSave={(patch) => saveBucket(b, patch)}
            />
          ))}
          {!staleApi && <NewBucketForm busy={busy === 'new'} onCreate={createBucket} />}
        </div>

        {/* Not an error — the tiers still work, and assignment is manual, so a
            hole in the bands cannot mis-bill anyone. It just means there is a
            volume with no tier to quote for it. */}
        {gaps.length > 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--tx-2)' }}>Bands don&apos;t line up:</strong>{' '}
            {gaps.join(' ')}
          </p>
        )}

        {msg?.where === 'tiers' && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--tx-2)' }}>{msg.text}</p>
        )}
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

        {/* Above the table, not below it: with 86 clients, a failure reported
            under the last row is a failure nobody sees. */}
        {msg?.where === 'clients' && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--tx-2)' }}>{msg.text}</p>
        )}

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
                        style={{ ...input, maxWidth: 200, padding: '6px 8px' }}
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

    </div>
  );
}
