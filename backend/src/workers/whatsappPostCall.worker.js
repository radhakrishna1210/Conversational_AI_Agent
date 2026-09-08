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
    if (status && status >= 400 && status < 500 && status !== 429) {
      throw new UnrecoverableError(err.message);
    }
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
