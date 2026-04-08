import * as contactService from '../services/contact.service.js';
import { parseCsvFile } from '../lib/csvParser.js';
import { enqueueContactImport } from '../queues/contactImport.queue.js';
import { unlink } from 'fs/promises';
import { PHONE_NUMBER_MIN_LENGTH, PHONE_NUMBER_MAX_LENGTH } from '../constants/limits.js';

// Bug fix #9: validate required fields before hitting the service
const validateContactBody = ({ phoneNumber }) => {
  if (!phoneNumber) {
    throw Object.assign(new Error('phoneNumber is required'), { statusCode: 400 });
  }
  const stripped = String(phoneNumber).replace(/[\s\-\(\)\+]/g, '');
  if (stripped.length < PHONE_NUMBER_MIN_LENGTH || stripped.length > PHONE_NUMBER_MAX_LENGTH) {
    throw Object.assign(
      new Error(`phoneNumber must be ${PHONE_NUMBER_MIN_LENGTH}–${PHONE_NUMBER_MAX_LENGTH} digits`),
      { statusCode: 400 }
    );
  }
};

export const createContact = async (req, res) => {
  validateContactBody(req.body);
  const contact = await contactService.upsertContact(req.params.workspaceId, req.body);
  res.status(201).json(contact);
};

export const listContacts = async (req, res) => {
  const result = await contactService.listContacts(req.params.workspaceId, req.query);
  res.json(result);
};

export const getContact = async (req, res) => {
  const contact = await contactService.getContact(req.params.workspaceId, req.params.contactId);
  res.json(contact);
};

export const uploadCsv = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Bug fix #6: offload to BullMQ worker when Redis is available so large files
  // don't block the request or hit HTTP timeouts
  const queued = enqueueContactImport(req.file.path, req.params.workspaceId);
  if (queued) {
    return res.json({ message: 'Import queued. Contacts will be available shortly.' });
  }

  // Fallback: process synchronously when Redis/queue is unavailable
  // Bug fix #7: use try/finally so the temp file is always cleaned up
  try {
    const rows = [];
    for await (const row of parseCsvFile(req.file.path)) {
      rows.push(row);
    }
    const result = await contactService.bulkUpsertContacts(req.params.workspaceId, rows);
    res.json({ message: 'Import complete', ...result });
  } finally {
    await unlink(req.file.path).catch(() => {});
  }
};

export const toggleOptOut = async (req, res) => {
  const contact = await contactService.toggleOptOut(
    req.params.workspaceId, req.params.contactId, req.body.optedOut
  );
  res.json(contact);
};

export const deleteContact = async (req, res) => {
  await contactService.deleteContact(req.params.workspaceId, req.params.contactId);
  res.json({ message: 'Contact deleted' });
};
