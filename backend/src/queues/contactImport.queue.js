import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis.js';

export const contactImportQueue = bullConnection
  ? new Queue('contact-import', bullConnection)
  : null;

export const enqueueContactImport = (filePath, workspaceId) => {
  if (!contactImportQueue) return null;
  return contactImportQueue.add('import', { filePath, workspaceId }, {
    attempts: 2,
    removeOnComplete: true,
    removeOnFail: 50,
  });
};
