import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { bulkUpsertContacts } from '../services/contact.service.js';
import { parseCsvFile } from '../lib/csvParser.js';
import { unlink } from 'fs/promises';
import logger from '../lib/logger.js';

const processImport = async (job) => {
  const { filePath, workspaceId } = job.data;
  logger.info({ filePath, workspaceId }, 'Contact import worker: starting');

  const rows = [];
  for await (const row of parseCsvFile(filePath)) {
    rows.push(row);
  }

  const result = await bulkUpsertContacts(workspaceId, rows);
  await unlink(filePath).catch(() => {});

  logger.info({ ...result, workspaceId }, 'Contact import worker: complete');
  return result;
};

export const createContactImportWorker = () => {
  if (!bullConnection) return null;
  return new Worker('contact-import', processImport, {
    ...bullConnection,
    concurrency: 3,
  });
};
