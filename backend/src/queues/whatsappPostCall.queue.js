/**
 * Queue for post-call WhatsApp confirmations.
 *
 * Why a queue at all: the send is the one part of post-call delivery that talks
 * to a customer. A webhook that fails is a lost integration event; a confirmation
 * that fails is a person who booked an appointment and never heard back. ChatFlow
 * restarts on every deploy of its own — both apps share a VPS — so a transient
 * failure at exactly the wrong moment is not hypothetical.
 *
 * What the queue does NOT do is prevent duplicates. `jobId` gives BullMQ a
 * de-duplication hint, but Redis is optional in this deployment and the queue
 * silently becomes a no-op without it. The real guard is the unique index on
 * WhatsAppPostCallSend(callLogId, postCallConfigId), claimed inside the send
 * itself — see whatsappPostCall.service.js.
 */
import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { JOB_MAX_ATTEMPTS, JOB_BACKOFF_DELAY_MS } from '../constants/limits.js';
import logger from '../lib/logger.js';

export const whatsappPostCallQueue = bullConnection
  ? new Queue('whatsapp-postcall', bullConnection)
  : null;

/**
 * BullMQ builds Redis keys from the job id, so a ':' in it collides with its own
 * key separator. Both ids are cuids, so '__' cannot appear inside either half.
 */
const jobIdFor = (callLogId, postCallConfigId) => `${callLogId}__${postCallConfigId}`;

/**
 * Add a send to `queue`, or answer null so the caller sends inline.
 *
 * The queue object is created at import whenever REDIS_URL is set. If Redis is
 * down or gives up reconnecting afterwards, the object still exists and `add`
 * REJECTS — which surfaced as the whole confirmation failing with "Connection
 * is closed" instead of taking the inline path Redis-less deployments use. A
 * refused add is treated exactly like having no queue. A duplicate is still
 * impossible either way: the send claims its WhatsAppPostCallSend row first.
 *
 * @returns {Promise<import('bullmq').Job|null>}
 */
export const enqueueWith = async (queue, payload) => {
  if (!queue) return null;
  try {
    return await queue.add('send', payload, {
      jobId: jobIdFor(payload.callLogId, payload.postCallConfigId),
      attempts: JOB_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY_MS },
      // Keep a window of history: when a client asks why a customer never got their
      // confirmation, the failed job and its error is the answer.
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  } catch (err) {
    logger.warn({ err: err.message, callLogId: payload.callLogId }, 'WhatsApp queue unavailable — sending the confirmation inline');
    return null;
  }
};

/**
 * @returns {Promise<import('bullmq').Job|null>} null when Redis is not
 *   configured or not accepting jobs — the caller MUST then send inline rather
 *   than treat the message as queued, or it is dropped in silence.
 */
export const enqueueWhatsAppSend = (payload) => enqueueWith(whatsappPostCallQueue, payload);
