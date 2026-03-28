import * as contactService from '../services/contact.service.js';
import { parseCsvFile } from '../lib/csvParser.js';
import { unlink } from 'fs/promises';

export const createContact = async (req, res) => {
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

  const rows = [];
  for await (const row of parseCsvFile(req.file.path)) {
    rows.push(row);
  }

  // Clean up temp file
  await unlink(req.file.path).catch(() => {});

  const result = await contactService.bulkUpsertContacts(req.params.workspaceId, rows);
  res.json({ message: 'Import complete', ...result });
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
