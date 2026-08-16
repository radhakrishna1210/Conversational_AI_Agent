// Place one one-way broadcast call.
//
// The counterpart of outboundCall.service.js, and deliberately much smaller,
// because everything that makes a conversational call complicated is absent:
// there is no agent, no media socket, no speech-to-text, no LLM, no per-call
// text-to-speech. The carrier dials, plays a file it fetches from us, and hangs
// up. That is the entire cost story — a broadcast is a telephony charge and
// nothing else — and this file is where that stays true.
//
// It shares the two things that must never diverge from the conversational path:
// carrier routing is still per caller ID (`VoiceNumber.provider`), and the
// carrier itself is still never named here.

import logger from '../../lib/logger.js';
import { resolveProvider } from '../telephony/index.js';
import { resolveProviderIdForNumber } from '../outboundCall.service.js';
import { publicHttpBase } from '../../lib/publicUrl.js';
import { publicAudioUrl } from './broadcastRecording.service.js';
import { signToken } from './signedToken.js';

/**
 * How long to ring before giving up, in seconds.
 *
 * Shorter than a normal call on purpose. Nobody is waiting to talk to us, and a
 * broadcast of 10,000 dials spends real time and real channel capacity holding
 * open rings that were never going to be answered.
 */
export const RING_TIMEOUT_SEC = Number(process.env.BROADCAST_RING_TIMEOUT_SEC || 30);

/**
 * Where Twilio posts the finished call.
 *
 * A broadcast has no socket and no call log, so this webhook is the ONLY place
 * its duration — and therefore its charge — can come from. Signed, because an
 * open endpoint here would let anyone mark calls answered and billed.
 */
export function twilioStatusCallbackUrl(recipientId) {
  const base = publicHttpBase();
  if (!base) return '';
  return `${base}/api/v1/broadcast/twilio/status`
    + `?rid=${encodeURIComponent(recipientId)}&token=${signToken('status', recipientId)}`;
}

/**
 * Is this caller ID able to broadcast at all?
 *
 * Checked once per broadcast rather than per dial, exactly like the campaign
 * runner's carrier pre-flight: asking the wrong carrier — or discovering on
 * recipient 4,000 that this one cannot play audio — are both failures that cost
 * a whole send.
 *
 * @returns {Promise<{ready: boolean, error?: string, provider?: string}>}
 */
export async function broadcastReadiness(fromNumber) {
  const provider = resolveProvider(await resolveProviderIdForNumber(fromNumber));

  if (provider.supportsBroadcast === false || typeof provider.buildBroadcastDoc !== 'function') {
    return {
      ready: false,
      provider: provider.id,
      error: `${provider.label} cannot play a hosted audio file on a call — it has no per-call `
        + 'document, only flows configured in its dashboard. Broadcast from a Plivo or Twilio '
        + `caller ID instead of ${fromNumber}.`,
    };
  }

  const status = provider.status(fromNumber);
  if (!status.ready) return { ready: false, provider: provider.id, error: status.error };

  if (!publicHttpBase()) {
    return {
      ready: false,
      provider: provider.id,
      error: 'This server has no public address (PUBLIC_BACKEND_WS_URL / PUBLIC_BACKEND_URL are '
        + 'unset), so the carrier has nowhere to fetch the recording from. Every call would connect '
        + 'and play silence.',
    };
  }

  return { ready: true, provider: provider.id };
}

/**
 * Dial one recipient and play the recording.
 *
 * @param {object} p
 * @param {object} p.recording   BroadcastRecording row
 * @param {string} p.recipientId BroadcastRecipient id — the identity the carrier hands back
 * @param {string} p.toNumber
 * @param {string} p.fromNumber
 * @param {number} [p.repeat]    times the recording is played on one answered call
 * @returns {Promise<{ok: boolean, callId?: string, provider: string, error?: string, status?: number}>}
 */
export async function placeBroadcastCall({ recording, recipientId, toNumber, fromNumber, repeat = 1 }) {
  const provider = resolveProvider(await resolveProviderIdForNumber(fromNumber));

  if (provider.supportsBroadcast === false || typeof provider.buildBroadcastDoc !== 'function') {
    return { ok: false, provider: provider.id, status: 400,
      error: `${provider.label} cannot place one-way broadcast calls.` };
  }

  const credentials = provider.status(fromNumber);
  if (!credentials.ready) {
    return { ok: false, provider: provider.id, status: 503, error: credentials.error };
  }

  let document;
  try {
    document = provider.buildBroadcastDoc({
      // Twilio takes the audio URL inline in its TwiML; Plivo takes an answer
      // URL and mints the audio URL itself at pickup, so it needs the id. Both
      // are passed and each provider ignores the one it does not use.
      audioUrl: publicAudioUrl(recording.id),
      recordingId: recording.id,
      repeat,
    });
  } catch (err) {
    return { ok: false, provider: provider.id, status: err.statusCode ?? 503, error: err.message };
  }

  try {
    const result = await provider.placeCall({
      credentials,
      to: toNumber,
      from: fromNumber || provider.defaultFrom(),
      document,
      context: {
        ringTimeoutSec: RING_TIMEOUT_SEC,
        // Twilio's completed-call webhook.
        statusCallbackUrl: twilioStatusCallbackUrl(recipientId),
        // Plivo has no per-call parameters of our choosing, so its identity
        // rides on the answer/hangup query string.
        query: { broadcastRecipientId: recipientId },
      },
    });

    if (!result.ok) {
      logger.warn(
        { provider: provider.id, status: result.httpStatus, to: toNumber },
        `Broadcast dial rejected: ${result.error}`,
      );
      return { ok: false, provider: provider.id, status: result.status ?? 502, error: result.error };
    }

    // Queued, not answered. The outcome arrives on the carrier's callback — this
    // return says only that the carrier accepted the request.
    return { ok: true, callId: result.callId, provider: provider.id };
  } catch (err) {
    logger.error({ err: err.message, to: toNumber }, 'Broadcast dial failed');
    return { ok: false, provider: provider.id, status: 502, error: `Call failed: ${err.message}` };
  }
}
