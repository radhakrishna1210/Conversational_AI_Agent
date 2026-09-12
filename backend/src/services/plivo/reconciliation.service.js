// Carrier usage reconciliation — Plivo's call records against ours.
//
// Two failure modes cost real money and neither is visible from our side alone
// (PLIVO_INTEGRATION.md §10):
//
//   carrier_only   Plivo billed a call we have no record of — a bridge that
//                  crashed after the dial, a leg nothing logged.
//   ours_only      we have a billed Plivo leg the carrier has no record of.
//
// plus two that are cheaper but still drift:
//
//   duration_mismatch  both sides saw the call, and disagree by more than the
//                      tolerance on how long it lasted.
//   unbilled           the carrier billed the call and the client's wallet
//                      was never charged for it.
//
// Findings are flagged for review and NEVER corrected automatically. A wallet is
// not adjusted from carrier data: the carrier's clock, currency and rounding are
// its own, and the right fix for a drift is usually in our code, not the ledger.
//
// Per subaccount, because that is what the subaccounts are for: each is listed
// with its own credentials, which is what attributes a record to a client.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { TELEPHONY_PROVIDER } from '../../constants/compliance.js';
import { plivoRequest, mainCredentials, isPlivoConfigured } from './client.js';
import { subaccountCredentials } from './subaccount.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Plivo: at most 20 per page, at most 30 days per search, 90 days kept. */
const PAGE = 20;
const MAX_SEARCH_MS = 30 * DAY;
const RETENTION_MS = 90 * DAY;

/** Legs near the edges of a window still match records just outside it. */
const EDGE_MARGIN_MS = HOUR;
/** The widest window a run may ask for, leaving room for the margins. */
export const MAX_WINDOW_MS = MAX_SEARCH_MS - 2 * EDGE_MARGIN_MS - 2 * DAY;
/** Records keep arriving for a while after a call ends. */
const DEFAULT_LAG_MS = 2 * HOUR;
const DEFAULT_SPAN_MS = DAY;

/** 250 pages is 5,000 records per account per run — a cap, not a target. */
const MAX_PAGES_PER_ACCOUNT = 250;
const DURATION_TOLERANCE_SEC = 90;
const MATCH_WINDOW_SEC = 180;
const MAX_DISCREPANCIES = 500;

// ── Pure helpers (exported for the tests) ───────────────────────────────────

export const digits = (n) => String(n ?? '').replace(/\D/g, '');

/**
 * Plivo's timestamps: "2026-09-12 10:15:03", sometimes with an offset
 * ("…+05:30"), sometimes with microseconds. No offset is read as UTC.
 */
export function parseCarrierTime(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The `YYYY-MM-DD HH:MM:ss` form Plivo's end_time filters take, in UTC. */
export const formatCarrierTime = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');

/** One Plivo call record, reduced to what the comparison needs. */
export function normalizeCdr(raw, account = {}) {
  const endTime = parseCarrierTime(raw?.end_time);
  const duration = Number(raw?.call_duration) || 0;
  return {
    callUuid: raw?.call_uuid ? String(raw.call_uuid) : null,
    direction: String(raw?.call_direction ?? '').toLowerCase(),
    from: digits(raw?.from_number),
    to: digits(raw?.to_number),
    endTime,
    startTime: endTime ? new Date(endTime.getTime() - duration * 1000) : null,
    billSec: Number(raw?.bill_duration ?? raw?.billed_duration) || 0,
    amount: Number(raw?.total_amount) || 0,
    hangupCause: raw?.hangup_cause_name ?? null,
    authId: account.authId ?? null,
    workspaceId: account.workspaceId ?? null,
  };
}

/** Why a requested window cannot be run, or null. */
export function windowProblem(start, end, now = Date.now()) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return 'The window start is not a valid date.';
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return 'The window end is not a valid date.';
  if (start >= end) return 'The window must start before it ends.';
  if (end.getTime() > now) return 'The window cannot end in the future.';
  if (now - start.getTime() > RETENTION_MS - DAY) return 'Plivo keeps call records for 90 days; start the window later.';
  if (end - start > MAX_WINDOW_MS) return `A window may span at most ${Math.floor(MAX_WINDOW_MS / DAY)} days.`;
  return null;
}

/**
 * Compare carrier records with our legs.
 *
 * Matching is by the carrier's call id first, then — for legs that never
 * learned it (placed before the column existed, or a hangup callback that never
 * arrived) — by the other party's number within a few minutes of the start.
 *
 * Only records and legs INSIDE the window are flagged; the margins exist so a
 * call straddling the edge still finds its partner.
 *
 * @param {object} p
 * @param {Array} p.cdrs  normalizeCdr() output
 * @param {Array} p.legs  { kind, id, workspaceId, provider, providerCallId, number,
 *                          startedAt: Date, durationSec, billedCents }
 * @param {{start: Date, end: Date}} [p.window]
 */
export function diffCarrierUsage({
  cdrs = [],
  legs = [],
  window = null,
  toleranceSec = DURATION_TOLERANCE_SEC,
  matchWindowSec = MATCH_WINDOW_SEC,
  maxDiscrepancies = MAX_DISCREPANCIES,
}) {
  const inWindow = (t) => !window || (t && t >= window.start && t <= window.end);

  const byCallId = new Map();
  const byNumber = new Map();
  for (const leg of legs) {
    if (leg.providerCallId) byCallId.set(leg.providerCallId, leg);
    if (leg.number) {
      if (!byNumber.has(leg.number)) byNumber.set(leg.number, []);
      byNumber.get(leg.number).push(leg);
    }
  }

  const matched = new Set();
  const discrepancies = [];
  let truncated = false;
  const flag = (d) => {
    if (discrepancies.length < maxDiscrepancies) discrepancies.push(d);
    else truncated = true;
  };

  const totals = {
    carrierCalls: 0,
    carrierBilledSec: 0,
    carrierAmount: 0,
    matched: 0,
    matchedByTime: 0,
    carrierOnly: 0,
    carrierOnlyUnbilled: 0,
    oursOnly: 0,
    durationMismatch: 0,
    unbilled: 0,
  };
  const perWorkspace = {};
  const bump = (workspaceId, key, n = 1) => {
    const k = workspaceId || '(main account)';
    perWorkspace[k] ??= { carrierCalls: 0, carrierBilledSec: 0, carrierAmount: 0, discrepancies: 0 };
    perWorkspace[k][key] += n;
  };

  for (const cdr of cdrs) {
    const counts = inWindow(cdr.endTime);
    if (counts) {
      totals.carrierCalls += 1;
      totals.carrierBilledSec += cdr.billSec;
      totals.carrierAmount += cdr.amount;
      bump(cdr.workspaceId, 'carrierCalls');
      bump(cdr.workspaceId, 'carrierBilledSec', cdr.billSec);
      bump(cdr.workspaceId, 'carrierAmount', cdr.amount);
    }

    let leg = cdr.callUuid ? byCallId.get(cdr.callUuid) : null;
    if (leg && matched.has(leg)) leg = null;
    let how = 'id';

    if (!leg && cdr.startTime) {
      // The other party: the callee on an outbound leg, the caller on inbound.
      const key = cdr.direction === 'inbound' ? cdr.from : cdr.to;
      let bestGap = Infinity;
      for (const c of byNumber.get(key) ?? []) {
        if (matched.has(c) || !c.startedAt) continue;
        const gap = Math.abs(c.startedAt.getTime() - cdr.startTime.getTime()) / 1000;
        if (gap <= matchWindowSec && gap < bestGap) { leg = c; bestGap = gap; }
      }
      how = 'time';
    }

    if (!leg) {
      if (!counts) continue;
      if (cdr.billSec > 0) {
        totals.carrierOnly += 1;
        bump(cdr.workspaceId, 'discrepancies');
        flag({
          kind: 'carrier_only',
          workspaceId: cdr.workspaceId,
          callUuid: cdr.callUuid,
          direction: cdr.direction,
          from: cdr.from,
          to: cdr.to,
          endTime: cdr.endTime?.toISOString() ?? null,
          carrierBillSec: cdr.billSec,
          carrierAmount: cdr.amount,
        });
      } else {
        totals.carrierOnlyUnbilled += 1;
      }
      continue;
    }

    matched.add(leg);
    if (!counts && !inWindow(leg.startedAt)) continue;
    totals.matched += 1;
    if (how === 'time') totals.matchedByTime += 1;

    const ourSec = Number(leg.durationSec) || 0;
    const drift = cdr.billSec - ourSec;
    const base = {
      workspaceId: leg.workspaceId ?? cdr.workspaceId,
      callUuid: cdr.callUuid,
      legKind: leg.kind,
      legId: leg.id,
      matchedBy: how,
      carrierBillSec: cdr.billSec,
      ourDurationSec: ourSec,
      ourBilledCents: Number(leg.billedCents) || 0,
      carrierAmount: cdr.amount,
    };
    if (Math.abs(drift) > toleranceSec) {
      totals.durationMismatch += 1;
      bump(base.workspaceId, 'discrepancies');
      flag({ kind: 'duration_mismatch', driftSec: drift, ...base });
    }
    if (cdr.billSec > 0 && !(Number(leg.billedCents) > 0)) {
      totals.unbilled += 1;
      bump(base.workspaceId, 'discrepancies');
      flag({ kind: 'unbilled', ...base });
    }
  }

  for (const leg of legs) {
    if (matched.has(leg) || !inWindow(leg.startedAt)) continue;
    // Only legs we KNOW went out on Plivo. A null provider is a leg placed
    // before the column existed — fine to match, wrong to accuse.
    if (leg.provider !== TELEPHONY_PROVIDER.PLIVO) continue;
    if (!(Number(leg.billedCents) > 0 || Number(leg.durationSec) > 0)) continue;
    totals.oursOnly += 1;
    bump(leg.workspaceId, 'discrepancies');
    flag({
      kind: 'ours_only',
      workspaceId: leg.workspaceId,
      legKind: leg.kind,
      legId: leg.id,
      providerCallId: leg.providerCallId ?? null,
      number: leg.number,
      startedAt: leg.startedAt?.toISOString() ?? null,
      ourDurationSec: Number(leg.durationSec) || 0,
      ourBilledCents: Number(leg.billedCents) || 0,
    });
  }

  totals.carrierAmount = Math.round(totals.carrierAmount * 10000) / 10000;
  return { totals, perWorkspace, discrepancies, truncated };
}

// ── Carrier and database reads ──────────────────────────────────────────────

/**
 * Every call record for one account in [from, to], paged.
 *
 * The end_time filter's timezone is not documented, so the search is padded by
 * up to a day each side and the caller trims on the parsed times — which carry
 * an explicit offset when Plivo gives one.
 */
async function listCallRecords(credentials, { from, to }) {
  const span = to - from;
  const pad = Math.max(0, Math.min(DAY, (MAX_SEARCH_MS - span) / 2 - HOUR));
  const query = {
    end_time__gte: formatCarrierTime(from.getTime() - pad),
    end_time__lte: formatCarrierTime(to.getTime() + pad),
    limit: String(PAGE),
  };

  const out = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES_PER_ACCOUNT; page += 1) {
    const res = await plivoRequest('/Call/', {
      method: 'GET',
      query: { ...query, offset: String(page * PAGE) },
      credentials,
    });
    const objects = Array.isArray(res?.objects) ? res.objects : [];
    out.push(...objects);
    const total = Number(res?.meta?.total_count);
    if (objects.length < PAGE || (Number.isFinite(total) && out.length >= total)) break;
    if (page === MAX_PAGES_PER_ACCOUNT - 1) truncated = true;
  }
  return { records: out, truncated };
}

/** Subaccounts first, main account last — a record seen twice keeps its client. */
async function reconciliationAccounts() {
  const rows = await prisma.plivoSubaccount.findMany({ select: { workspaceId: true, authId: true } });
  const accounts = [];
  const errors = [];
  for (const row of rows) {
    try {
      const creds = await subaccountCredentials(row.workspaceId);
      if (creds) accounts.push({ label: row.authId, workspaceId: row.workspaceId, credentials: creds });
    } catch (err) {
      errors.push({ account: row.authId, workspaceId: row.workspaceId, error: err.message });
    }
  }
  const main = mainCredentials();
  if (main) accounts.push({ label: 'main', workspaceId: null, credentials: main });
  return { accounts, errors };
}

/** Our phone legs around the window: agent calls and broadcast recipients. */
async function loadOurLegs(from, to) {
  const range = { gte: new Date(from.getTime() - EDGE_MARGIN_MS), lte: new Date(to.getTime() + EDGE_MARGIN_MS) };
  const [calls, recipients] = await Promise.all([
    prisma.agentCallLog.findMany({
      where: { type: 'PHONE_CALL', startedAt: range },
      select: {
        id: true, workspaceId: true, provider: true, providerCallId: true, phoneNumber: true,
        startedAt: true, durationSec: true, billedCents: true,
      },
      take: 50_000,
    }),
    prisma.broadcastRecipient.findMany({
      where: { provider: TELEPHONY_PROVIDER.PLIVO, startedAt: range },
      select: {
        id: true, provider: true, providerCallId: true, phoneNumber: true, startedAt: true,
        durationSec: true, billedCents: true, broadcast: { select: { workspaceId: true } },
      },
      take: 50_000,
    }),
  ]);

  return [
    ...calls.map((c) => ({
      kind: 'call', id: c.id, workspaceId: c.workspaceId, provider: c.provider,
      providerCallId: c.providerCallId, number: digits(c.phoneNumber),
      startedAt: c.startedAt, durationSec: c.durationSec, billedCents: c.billedCents,
    })),
    ...recipients.map((r) => ({
      kind: 'broadcast', id: r.id, workspaceId: r.broadcast?.workspaceId ?? null, provider: r.provider,
      providerCallId: r.providerCallId, number: digits(r.phoneNumber),
      startedAt: r.startedAt, durationSec: r.durationSec, billedCents: r.billedCents,
    })),
  ];
}

// ── Runs ────────────────────────────────────────────────────────────────────

/**
 * Reconcile one window. Defaults to the 24 hours ending two hours ago.
 *
 * @returns {Promise<{ok: boolean, run?: object, error?: string, status?: number}>}
 */
export async function runReconciliation({ from = null, to = null, trigger = 'manual', triggeredBy = null } = {}) {
  if (!isPlivoConfigured()) return { ok: false, status: 503, error: 'Plivo is not configured on this server.' };

  const now = Date.now();
  const windowEnd = to ? new Date(to) : new Date(now - DEFAULT_LAG_MS);
  const windowStart = from ? new Date(from) : new Date(windowEnd.getTime() - DEFAULT_SPAN_MS);
  const problem = windowProblem(windowStart, windowEnd, now);
  if (problem) return { ok: false, status: 400, error: problem };

  // A run the process died in the middle of would otherwise read RUNNING forever.
  await prisma.carrierReconciliationRun.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(now - 2 * HOUR) } },
    data: { status: 'FAILED', error: 'Interrupted — the server stopped during the run.', finishedAt: new Date() },
  }).catch(() => {});

  const run = await prisma.carrierReconciliationRun.create({
    data: { provider: TELEPHONY_PROVIDER.PLIVO, trigger, windowStart, windowEnd, triggeredBy },
  });

  try {
    const { accounts, errors: accountErrors } = await reconciliationAccounts();
    const fetchFrom = new Date(windowStart.getTime() - EDGE_MARGIN_MS);
    const fetchTo = new Date(windowEnd.getTime() + EDGE_MARGIN_MS);

    const seen = new Set();
    const cdrs = [];
    const truncatedAccounts = [];
    for (const account of accounts) {
      try {
        const { records, truncated } = await listCallRecords(account.credentials, { from: fetchFrom, to: fetchTo });
        if (truncated) truncatedAccounts.push(account.label);
        for (const raw of records) {
          const cdr = normalizeCdr(raw, { authId: account.credentials.authId, workspaceId: account.workspaceId });
          if (!cdr.endTime || cdr.endTime < fetchFrom || cdr.endTime > fetchTo) continue;
          if (cdr.callUuid) {
            if (seen.has(cdr.callUuid)) continue;
            seen.add(cdr.callUuid);
          }
          cdrs.push(cdr);
        }
      } catch (err) {
        accountErrors.push({ account: account.label, workspaceId: account.workspaceId, error: err.message });
      }
    }

    const legs = await loadOurLegs(windowStart, windowEnd);
    const diff = diffCarrierUsage({ cdrs, legs, window: { start: windowStart, end: windowEnd } });

    const summary = {
      ...diff.totals,
      accounts: accounts.length,
      ourLegs: legs.length,
      accountErrors,
      truncatedAccounts,
      discrepanciesTruncated: diff.truncated,
      perWorkspace: diff.perWorkspace,
    };
    const updated = await prisma.carrierReconciliationRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', summary, discrepancies: diff.discrepancies, finishedAt: new Date() },
    });

    const drift = diff.totals.carrierOnly + diff.totals.oursOnly + diff.totals.durationMismatch + diff.totals.unbilled;
    logger[drift || accountErrors.length ? 'warn' : 'info'](
      { runId: run.id, ...diff.totals, accountErrors: accountErrors.length },
      drift ? 'Carrier reconciliation found drift — review it in Admin → Numbers & Carrier' : 'Carrier reconciliation clean',
    );
    return { ok: true, run: updated };
  } catch (err) {
    logger.error({ runId: run.id, err: err.message }, 'Carrier reconciliation failed');
    await prisma.carrierReconciliationRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', error: String(err.message).slice(0, 1000), finishedAt: new Date() },
    }).catch(() => {});
    return { ok: false, status: 500, error: err.message, runId: run.id };
  }
}

/**
 * The daily pass. Picks up where the last scheduled run ended, so no stretch of
 * calls is skipped or counted twice; runs at most once per `minIntervalMs`
 * however often the timer fires or the server restarts.
 */
export async function runScheduledReconciliation({ minIntervalMs = 20 * HOUR } = {}) {
  if (process.env.PLIVO_RECONCILIATION_ENABLED === 'false' || !isPlivoConfigured()) return null;

  const last = await prisma.carrierReconciliationRun.findFirst({
    where: { trigger: 'schedule' },
    orderBy: { startedAt: 'desc' },
  });
  if (last && Date.now() - last.startedAt.getTime() < minIntervalMs) return null;

  const end = new Date(Date.now() - DEFAULT_LAG_MS);
  let start = last?.status === 'COMPLETED' ? new Date(last.windowEnd) : new Date(end.getTime() - DEFAULT_SPAN_MS);
  if (end - start > MAX_WINDOW_MS) start = new Date(end.getTime() - MAX_WINDOW_MS);
  if (start >= end) return null;

  return runReconciliation({ from: start, to: end, trigger: 'schedule' });
}

/** Recent runs, without their discrepancy lists. */
export function listReconciliationRuns({ limit = 30 } = {}) {
  return prisma.carrierReconciliationRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(1, Number(limit) || 30), 100),
    select: {
      id: true, provider: true, trigger: true, windowStart: true, windowEnd: true, status: true,
      summary: true, error: true, triggeredBy: true, startedAt: true, finishedAt: true,
    },
  });
}

/** One run, discrepancies included. */
export function getReconciliationRun(id) {
  return prisma.carrierReconciliationRun.findUnique({ where: { id } });
}
