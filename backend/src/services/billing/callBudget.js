// backend/src/services/billing/callBudget.js
/**
 * The wall clock that stops a call when the wallet runs out.
 *
 * WHY THIS EXISTS
 * ---------------
 * assertCanStartCall() answers "can this workspace afford to START a call?".
 * Nothing answered "…and for how long?", so a workspace holding one minute of
 * balance could run a thirty-minute call: every second of it was served, and
 * settlement — which must never refuse usage already delivered — pushed the
 * balance deep into the negative. A prepaid wallet that can go negative is not
 * prepaid; it is credit nobody agreed to extend.
 *
 * The fix is a per-call deadline derived from the balance at pickup:
 * `maxSeconds` from the gate, counted from the moment the media starts.
 *
 * WHY A TIMER AND NOT A BALANCE POLL
 * ----------------------------------
 * The balance does not move DURING a call — the only debit for this call lands
 * at settlement, after it ends — so polling would learn nothing a timer set at
 * pickup does not already know. It would just add a database round trip per
 * tick to the latency-critical audio path. The one thing a timer misses is a
 * top-up mid-call, which extends the budget rather than shortening it, so the
 * cost of missing it is a call cut slightly early, and `extend()` exists for the
 * transports that learn about one.
 *
 * The deadline is deliberately generous by one increment: `affordableSeconds()`
 * floors, so the last second the call is allowed to use is one the wallet can
 * pay for in full. A caller can never end a call owing money.
 */

import logger from '../../lib/logger.js';

/** How long before the cutoff the caller is told the balance is running out. */
const DEFAULT_WARN_LEAD_SEC = 30;

/**
 * @param {object} p
 * @param {number} p.maxSeconds   from assertCanStartCall(); Infinity disables the budget
 * @param {() => void} p.onExpire hang up — the balance is spent
 * @param {(secondsLeft: number) => void} [p.onWarn] optional heads-up before the cutoff
 * @param {number} [p.warnLeadSec]
 * @param {string} [p.label]      names the transport in log lines
 * @returns {{ expired: () => boolean, secondsLeft: () => number, extend: (seconds: number) => void, stop: () => void }}
 */
export function createCallBudget({
  maxSeconds,
  onExpire,
  onWarn = null,
  warnLeadSec = DEFAULT_WARN_LEAD_SEC,
  label = 'call',
}) {
  const startedAt = Date.now();
  let deadlineMs = Number.isFinite(maxSeconds) ? maxSeconds * 1000 : Infinity;
  let fired = false;
  let expireTimer = null;
  let warnTimer = null;

  const clear = () => {
    if (expireTimer) { clearTimeout(expireTimer); expireTimer = null; }
    if (warnTimer) { clearTimeout(warnTimer); warnTimer = null; }
  };

  const arm = () => {
    clear();
    if (!Number.isFinite(deadlineMs)) return;
    const remaining = Math.max(0, deadlineMs - (Date.now() - startedAt));

    expireTimer = setTimeout(() => {
      fired = true;
      logger.info(
        { label, maxSeconds, ranForSec: Math.round((Date.now() - startedAt) / 1000) },
        'Call budget exhausted — ending the call before the wallet goes negative',
      );
      try { onExpire(); } catch (err) {
        logger.warn({ label, err: err.message }, 'Call budget expiry handler failed');
      }
    }, remaining);
    // Timers must never hold the process open on their own — a pending hangup is
    // not a reason to keep Node alive at shutdown.
    expireTimer.unref?.();

    const warnIn = remaining - warnLeadSec * 1000;
    if (onWarn && warnIn > 0) {
      warnTimer = setTimeout(() => {
        try { onWarn(Math.round((deadlineMs - (Date.now() - startedAt)) / 1000)); } catch { /* advisory only */ }
      }, warnIn);
      warnTimer.unref?.();
    }
  };

  arm();

  return {
    expired: () => fired,
    secondsLeft: () => (Number.isFinite(deadlineMs)
      ? Math.max(0, Math.round((deadlineMs - (Date.now() - startedAt)) / 1000))
      : Infinity),
    /** A mid-call top-up bought more time. */
    extend: (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0 || fired) return;
      deadlineMs += seconds * 1000;
      arm();
    },
    stop: clear,
  };
}

/**
 * Gate a call and arm its budget in one step — what every media bridge needs at
 * pickup, and the reason this is a function rather than a paragraph copied into
 * five files. The bridges differ only in how they hang up.
 *
 * ALWAYS returns a `budget` — an inert one when the call is refused — so a
 * caller can hold it unconditionally without null checks; and never throws.
 * A billing lookup that fails must not drop a live call — that would turn a
 * transient database blip into dropped calls for everybody, which is a far worse
 * outcome than the occasional unbilled minute. It fails OPEN, loudly.
 *
 * @param {object} p
 * @param {string} p.workspaceId
 * @param {'WEB_CALL'|'PHONE_CALL'} [p.type]
 * @param {string} p.label                  names the transport in log lines
 * @param {() => void} p.onExpire           hang up — the balance is spent
 * @param {(secondsLeft: number) => void} [p.onWarn]
 * @returns {Promise<{ allowed: boolean, code?: string, message?: string, budget: object }>}
 */
export async function openCallBudget({ workspaceId, type = 'PHONE_CALL', label, onExpire, onWarn = null }) {
  let gate;
  try {
    // Imported here rather than at the top so the timer half of this module
    // pulls in no database client, and can be unit-tested anywhere. The module
    // is cached after the first call, so this is not a per-call cost.
    const { assertCanStartCall } = await import('./settlement.service.js');
    gate = await assertCanStartCall(workspaceId, { type });
  } catch (err) {
    logger.error(
      { workspaceId, type, label, err: err.message },
      'Could not read the wallet to gate this call — allowing it rather than dropping it',
    );
    gate = { allowed: true, maxSeconds: Infinity };
  }

  if (!gate.allowed) {
    const inert = {
      expired: () => true, secondsLeft: () => 0, extend: () => {}, stop: () => {},
    };
    return { allowed: false, code: gate.code, message: gate.message, budget: inert };
  }

  return {
    allowed: true,
    budget: createCallBudget({ maxSeconds: gate.maxSeconds, label, onExpire, onWarn }),
  };
}
