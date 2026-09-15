// backend/src/controllers/twilioCall.controller.js
/**
 * The one public Twilio agent-call endpoint:
 *
 *   POST /api/v1/twilio/call-status?callLogId=…&token=…
 *       Twilio's completed-call callback, requested by placeOutboundCall for
 *       every Twilio agent call. For a dial nobody answered and for a
 *       greeting-only call (no media socket) it is the only end-of-call signal
 *       there is. See services/telephony/carrierCloseOut.js.
 *
 * Twilio posts form-encoded bodies; app.js parses them globally.
 */

import logger from '../lib/logger.js';
import {
  closeOutCarrierCall, verifyCallStatusToken, TWILIO_TERMINAL,
} from '../services/telephony/carrierCloseOut.js';

/** Twilio's vocabulary for a call that reached a person. */
const TWILIO_ANSWERED = new Set(['completed']);

export async function callStatus(req, res) {
  const callLogId = String(req.query?.callLogId || '');
  if (!verifyCallStatusToken(callLogId, req.query?.token)) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  // Answer first, work after: a carrier webhook kept waiting is one that retries.
  res.json({ ok: true });

  const status = String(req.body?.CallStatus ?? '').toLowerCase();
  // Only a terminal status ends a call. An empty or intermediate one is not a
  // reason to close out a live conversation.
  if (!TWILIO_TERMINAL.has(status)) return;
  const durationSec = Number(req.body?.CallDuration ?? 0) || 0;

  try {
    const outcome = await closeOutCarrierCall({
      callLogId,
      answered: TWILIO_ANSWERED.has(status) && durationSec > 0,
      durationSec,
      label: 'Twilio phone call',
    });
    logger.info({ callLogId, status, durationSec, outcome }, 'Twilio call-status callback handled');
  } catch (e) {
    logger.warn(`Twilio call-status callback could not close out ${callLogId}: ${e.message}`);
  }
}
