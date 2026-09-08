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

export const whatsappPostCallQueue = bullConnection
  ? new Queue('whatsapp-postcall', bullConnection)
  : null;

/**
 * BullMQ builds Redis keys from the job id, so a ':' in it collides with its own
 * key separator. Both ids are cuids, so '__' cannot appear inside either half.
 */
const jobIdFor = (callLogId, postCallConfigId) => `${callLogId}__${postCallConfigId}`;

/**
 * @returns {Promise<import('bullmq').Job>|null} null when Redis is not
 *   configured — the caller MUST then send inline rather than treat the message
 *   as queued, or it is dropped in silence.
 */
export const enqueueWhatsAppSend = (payload) => {
  if (!whatsappPostCallQueue) return null;
  return whatsappPostCallQueue.add('send', payload, {
    jobId: jobIdFor(payload.callLogId, payload.postCallConfigId),
    attempts: JOB_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY_MS },
    // Keep a window of history: when a client asks why a customer never got their
    // confirmation, the failed job and its error is the answer.
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  });
};
