// backend/src/ws/callFinalizer.js
/**
 * The end of a phone call, shared by every carrier bridge.
 *
 * Extracted when the Exotel bridge arrived and this would have become the THIRD
 * byte-identical copy. It is billing-critical and it is subtle in ways that are
 * invisible when you read any one copy:
 *
 *   - it must run exactly once. Every carrier ends a call with a `stop` event
 *     AND a socket `close`, so cleanup() is always reachable twice. Running
 *     twice duplicates the Google Sheets row / webhook / email for one call.
 *   - a failed status write must NOT skip settlement. A call left PENDING is
 *     never revisited by anything, so it reads as unpaid forever.
 *   - post-call delivery is best effort. A webhook that 500s must not take the
 *     socket teardown down with it.
 *
 * Three copies of that would have drifted. `label` is the only thing the
 * bridges disagreed on, and it only ever appears in a log line.
 *
 * The second export, finalizeAbandonedCall(), is the mirror image for the ONE
 * transport where the client owns the call log: the modular web call.
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { settleCall } from '../services/billing/settlement.service.js';
import { releaseSlot } from '../services/telephony/concurrency.js';
import { extractAndStoreCallVariables } from '../services/postCallExtraction.service.js';
import { deliverPostCall } from '../controllers/agentCallLog.controller.js';

/**
 * @param {object} p
 * @param {string} p.workspaceId
 * @param {string} p.agentId
 * @param {string} p.label       names the bridge in log lines, e.g. 'Exotel phone call'
 * @returns {(callLogId: string|null, status: string, ctx: {transcript: Array,
 *            startedAt: number}) => Promise<void>}  safe to call repeatedly
 */
export function createCallFinalizer({ workspaceId, agentId, label }) {
  let finalized = false;

  return async function finalizeCallLog(callLogId, status, { transcript = [], startedAt }) {
    if (!callLogId || finalized) return;
    finalized = true;

    // Give the carrier concurrency slot back FIRST, before any of the awaits
    // below. Settlement, post-call extraction and webhook delivery can take
    // seconds, and holding a slot through them would make a campaign's
    // effective ceiling a function of how slow the customer's webhook is.
    releaseSlot(callLogId);

    try {
      await prisma.agentCallLog.update({
        where: { id: callLogId },
        data: {
          status,
          transcript: JSON.stringify(transcript.slice(-200)),
          durationSec: Math.round((Date.now() - startedAt) / 1000),
          endedAt: new Date(),
        },
      });
    } catch (e) {
      // Fall through to settlement rather than returning — see the header.
      logger.warn(`Could not finalize ${label} log: ${e.message}`);
    }

    await settleCall(callLogId);

    // A phone call has no browser client to PATCH the REST call-log endpoint,
    // so extraction + Post-Call delivery (webhook / email / Google Sheets) is
    // driven from here, mirroring updateCallLog in agentCallLog.controller.js.
    try {
      await extractAndStoreCallVariables(workspaceId, agentId, callLogId);
      const row = await prisma.agentCallLog.findFirst({
        where: { id: callLogId, workspaceId, agentId },
      });
      if (row) await deliverPostCall(workspaceId, agentId, row);
    } catch (e) {
      logger.warn(`Post-call extraction/delivery failed for ${label} ${callLogId}: ${e.message}`);
    }
  };
}

/**
 * Finish a call whose CLIENT never did — the closed-tab backstop.
 *
 * A modular web call's log is owned by the browser: it POSTs the row, PATCHes
 * the transcript per turn, and ends it with `{ ended: true }`, which is what
 * triggers settlement, extraction and Post-Call delivery. Close the tab, lose
 * the network, or crash the page and that last PATCH never happens, so the call
 * sat IN_PROGRESS until the 2-hour reaper retired it as SKIPPED — served,
 * recorded, and never charged. Minutes we paid Deepgram, the LLM and the TTS
 * provider for, given away because a browser did not get a chance to say
 * goodbye.
 *
 * WHY endedAt IS THE LOCK
 * -----------------------
 * The browser and this backstop can both reach a call, so exactly one of them
 * has to win. `endedAt` is the natural claim: it is null for the whole life of
 * the call, it is set by whichever side finalizes, and a conditional UPDATE on
 * it is atomic in the database. Checking `if (row.endedAt)` first and writing
 * second would be the same read-then-write race this repo has already been
 * bitten by in settlement.
 *
 * Losing the claim is the NORMAL, healthy outcome: it means the browser
 * finalized the call itself, which is the better path because it carries the
 * recording and the final transcript. This only runs the pipeline when nothing
 * else did.
 *
 * @param {string} callLogId
 * @param {object} p
 * @param {string} p.workspaceId
 * @param {string} p.agentId
 * @param {Date}   p.endedAt   when the MEDIA stopped, not when this ran — the
 *   grace period before the backstop fires must not be billed to the customer
 * @param {string} [p.status]
 * @param {string} [p.label]
 * @returns {Promise<boolean>} true when this call finalized it
 */
export async function finalizeAbandonedCall(callLogId, {
  workspaceId, agentId, endedAt = new Date(), status = 'COMPLETED', label = 'web call',
}) {
  if (!callLogId) return false;

  try {
    const row = await prisma.agentCallLog.findFirst({
      where: { id: callLogId, workspaceId, agentId },
    });
    // No row at all means the client's POST failed; there is nothing to bill
    // against and nothing this can do about it.
    if (!row) return false;
    if (row.endedAt) return false; // client finalized it — the normal case

    const durationSec = Math.max(0, Math.round((endedAt - row.startedAt) / 1000));
    const claimed = await prisma.agentCallLog.updateMany({
      // The claim. Only one writer can move endedAt off null.
      where: { id: callLogId, endedAt: null },
      data: { status, endedAt, durationSec },
    });
    if (claimed.count === 0) return false;

    logger.info(
      { callLogId, workspaceId, agentId, durationSec },
      `${label} was never ended by its client — finalizing and billing it server-side`,
    );

    // Deliberately NOT touching the transcript: the browser owns it and has been
    // PATCHing it turn by turn, so whatever landed before it disappeared is the
    // best record that exists. Overwriting it from here would only erase it.
    await settleCall(callLogId);

    try {
      await extractAndStoreCallVariables(workspaceId, agentId, callLogId);
      const fresh = await prisma.agentCallLog.findFirst({
        where: { id: callLogId, workspaceId, agentId },
      });
      if (fresh) await deliverPostCall(workspaceId, agentId, fresh);
    } catch (e) {
      logger.warn(`Post-call extraction/delivery failed for abandoned ${label} ${callLogId}: ${e.message}`);
    }
    return true;
  } catch (err) {
    logger.error({ callLogId, err: err.message }, `Could not finalize abandoned ${label}`);
    return false;
  }
}
