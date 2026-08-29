// client/src/pages/BroadcastRateTab.tsx
/**
 * Super Admin → Pricing. What a one-way recorded broadcast costs per minute.
 *
 * WHY THIS IS ITS OWN PRICE AND NOT THE WALLET RATE
 *
 * A conversational minute costs us a carrier minute plus streaming, STT, an LLM
 * and TTS, every second of every call. A broadcast minute costs us a carrier
 * minute and nothing else — the audio was rendered once, weeks earlier. Billing
 * a 30-second recorded message at the conversational rate would quote about
 * ₹2.90 against roughly ₹0.30 of cost, which is not a margin, it is a reason to
 * lose the deal. See services/billing/broadcastRate.js.
 *
 * WHY THIS CARD EXISTS
 *
 * The rate was already stored, already charged, and already read by the client
 * Broadcast page — but the only way to change it was a hand-written PUT. An
 * admin looking at "every price on the platform" was being shown all of them
 * except the one for the product sold on price.
 */
import { useEffect, useState } from 'react';
import { API } from '@/lib/adminApi';
import { authFetch } from '@/lib/authFetch';

/**
 * Verified carrier cost of a broadcast minute: Plivo India bills a flat
 * ₹0.60/min, and on a broadcast there is no other line in the bill. Hardcoded
 * because it is a measured fact about the carrier, not a setting — it moves
 * when we renegotiate, not when an admin types.
 */
const CARRIER_COST_PER_MIN = 0.6;

const rateInput: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--s2)',
  border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--tx)',
  fontFamily: 'var(--ff-b)', fontSize: 20, maxWidth: 180,
};

export default function BroadcastRateTab() {
  const [rate, setRate] = useState<string>('');
  const [saved, setSaved] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await authFetch(API('/broadcast-rate'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setRate(String(data.perMinuteInr));
      setSaved(data.perMinuteInr);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await authFetch(API('/broadcast-rate'), {
        method: 'PUT', body: JSON.stringify({ perMinuteInr: Number(rate) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaved(data.perMinuteInr);
      setRate(String(data.perMinuteInr));
      setMsg('Saved. Every broadcast from now on is charged at this rate.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  };

  const parsed = Number(rate);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const dirty = valid && parsed !== saved;
  // The number that decides whether the price is worth holding: what is left
  // after the carrier takes its cut. Broadcasts have no other variable cost.
  const marginPct = valid ? Math.round(((parsed - CARRIER_COST_PER_MIN) / parsed) * 100) : 0;

  if (err) return <p style={{ color: 'var(--err)' }}>Couldn&apos;t load the broadcast rate: {err}</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 620 }}>
      <p style={{ color: 'var(--tx-3)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        Charged for a one-way recorded call, deducted from the workspace&apos;s wallet. It is
        separate from the conversational rate above because a broadcast costs us only a
        carrier minute — no transcription, no model, no live speech. Volume tiers and
        per-client overrides do <strong>not</strong> apply to broadcasts; this is the one
        rate every client pays.
      </p>

      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--tx-3)', fontSize: 12 }}>
          Rupees per minute
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 20, color: 'var(--tx-2)' }}>₹</span>
            <input
              type="number" step="0.01" min="0.01" value={rate}
              onChange={e => { setRate(e.target.value); setMsg(null); }}
              style={rateInput}
            />
            <span style={{ fontSize: 13, color: 'var(--tx-3)' }}>/ minute</span>
          </div>
        </label>

        {/* A broadcast is typically well under a minute, so the per-minute figure
            is not what a customer hears quoted — the 30-second price is. */}
        {valid && (
          <p style={{ color: 'var(--tx-3)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            A 30-second message bills ₹{(parsed / 2).toFixed(2)} against about
            ₹{(CARRIER_COST_PER_MIN / 2).toFixed(2)} of carrier cost — {marginPct}% gross.
            {marginPct < 50 && ' Below the 50% line the rate card is built on.'}
          </p>
        )}

        {!valid && rate !== '' && (
          <p style={{ color: 'var(--err)', fontSize: 12, margin: 0 }}>Enter a rate greater than zero.</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={save} disabled={!dirty || busy}
            style={{
              padding: '9px 16px', borderRadius: 8,
              border: '1px solid var(--teal, var(--cyan-fg))',
              background: dirty ? 'var(--teal, var(--cyan-fg))' : 'transparent',
              color: dirty ? 'var(--on-cyan)' : 'var(--teal, var(--cyan-fg))', fontWeight: 600,
              cursor: dirty && !busy ? 'pointer' : 'default', opacity: dirty || busy ? 1 : 0.5,
            }}
          >
            {busy ? 'Saving…' : 'Save rate'}
          </button>
          {msg && <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
