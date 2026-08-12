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
 */

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { settleCall } from '../services/billing/settlement.service.js';
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
