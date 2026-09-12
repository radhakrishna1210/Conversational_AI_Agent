import { Worker, UnrecoverableError } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { sendWhatsAppConfirmation } from '../services/whatsappPostCall.service.js';
import logger from '../lib/logger.js';

/**
 * Send one confirmation.
 *
 * Retries are for transient failures only — ChatFlow restarting, a network blip,
 * Meta rate-limiting. A 4xx means the request itself is wrong: the recipient has
 * opted out, the template is not approved, the number is not on this workspace.
 * Retrying those three times with backoff changes nothing and buries the real
 * reason under two more identical failures, so they stop the job immediately.
 *
 * 429 is the exception — it is a 4xx that genuinely does mean "try later".
 */
const processSend = async (job) => {
  const { workspaceId, ...rest } = job.data;
  try {
    const out = await sendWhatsAppConfirmation(workspaceId, rest);
    if (out.duplicate) {
      logger.info({ callLogId: rest.callLogId }, 'WhatsApp worker: already sent, nothing to do');
    }
    return out;
  } catch (err) {
    const status = err?.statusCode;
    const permanent = Boolean(status && status >= 400 && status < 500 && status !== 429);
    // Logged here because nothing else would: BullMQ records the failure on the
    // job in Redis and says nothing, so a permanent refusal used to vanish
    // without a line in any log. The send service has already written the
    // reason onto the call's WhatsApp row where it could.
    logger.warn({
      workspaceId,
      callLogId: rest.callLogId,
      postCallConfigId: rest.postCallConfigId,
      attempt: job.attemptsMade + 1,
      permanent,
      err: err?.message,
    }, permanent ? 'WhatsApp confirmation refused — not retrying' : 'WhatsApp confirmation failed — will retry');
    if (permanent) throw new UnrecoverableError(err.message);
    throw err;
  }
};

export const createWhatsAppPostCallWorker = () => {
  if (!bullConnection) return null;
  return new Worker('whatsapp-postcall', processSend, {
    ...bullConnection,
    // Deliberately modest. These run on the same box as the voice pipeline, whose
    // latency budget is already tight; a confirmation arriving a second later
    // costs nobody anything, a jittery call costs the customer.
    concurrency: 2,
  });
};
