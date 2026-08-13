import { unlink } from 'fs/promises';
import * as contacts from '../services/contact.service.js';
import { parseCsvFile } from '../lib/csvParser.js';

/**
 * Read an uploaded CSV into memory.
 *
 * Bounded by the multer size limit and by the row cap the service enforces, so
 * "in memory" is a few MB of strings at worst. Streaming straight into the
 * database would save that, but it would also make the import non-atomic from
 * the user's point of view — a half-imported list with a helpful progress bar is
 * worse than a slightly slower one that either lands or doesn't.
 */
export const readCsvRows = async (filePath) => {
  const rows = [];
  for await (const row of parseCsvFile(filePath)) rows.push(row);
  return rows;
};

const asArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  }
};

// ── Contacts ────────────────────────────────────────────────────────────────

export const listContacts = async (req, res) => {
  const { search, status, clusterId, page, pageSize } = req.query;
  res.json(await contacts.listContacts(req.params.workspaceId, { search, status, clusterId, page, pageSize }));
};

export const contactSummary = async (req, res) => {
  res.json(await contacts.contactSummary(req.params.workspaceId));
};

export const getContact = async (req, res) => {
  res.json(await contacts.getContact(req.params.workspaceId, req.params.contactId));
};

export const createContact = async (req, res) => {
  const created = await contacts.createContact(req.params.workspaceId, {
    ...req.body,
    clusterIds: asArray(req.body.clusterIds),
  });
  res.status(201).json(created);
};

export const updateContact = async (req, res) => {
  res.json(await contacts.updateContact(req.params.workspaceId, req.params.contactId, req.body));
};

export const deleteContact = async (req, res) => {
  res.json(await contacts.deleteContacts(req.params.workspaceId, [req.params.contactId]));
};

export const bulkDeleteContacts = async (req, res) => {
  res.json(await contacts.deleteContacts(req.params.workspaceId, asArray(req.body.contactIds)));
};

export const setContactStatus = async (req, res) => {
  res.json(await contacts.setContactStatus(
    req.params.workspaceId, asArray(req.body.contactIds), String(req.body.status ?? ''),
  ));
};

export const addToClusters = async (req, res) => {
  const workspaceId = req.params.workspaceId;
  let clusterIds = asArray(req.body.clusterIds);

  // "Add to a new list" is one action for the user; making them create the
  // cluster first would be two.
  if (req.body.newClusterName) {
    const cluster = await contacts.createCluster(workspaceId, { name: req.body.newClusterName });
    clusterIds = [...clusterIds, cluster.id];
  }
  res.json(await contacts.addToClusters(workspaceId, asArray(req.body.contactIds), clusterIds));
};

export const importContacts = async (req, res) => {
  if (!req.file) throw Object.assign(new Error('CSV file is required'), { statusCode: 400 });
  try {
    const rows = await readCsvRows(req.file.path);
    const result = await contacts.importContacts(req.params.workspaceId, rows, {
      clusterId: req.body.clusterId || null,
      clusterName: req.body.clusterName || null,
      description: req.body.description || null,
      csvFileName: req.file.originalname,
      source: contacts.CLUSTER_SOURCE.CSV_IMPORT,
    });
    res.status(201).json(result);
  } finally {
    await unlink(req.file.path).catch(() => {});
  }
};

// ── Clusters ────────────────────────────────────────────────────────────────

export const listClusters = async (req, res) => {
  res.json(await contacts.listClusters(req.params.workspaceId));
};

export const createCluster = async (req, res) => {
  res.status(201).json(await contacts.createCluster(req.params.workspaceId, req.body));
};

export const getCluster = async (req, res) => {
  res.json(await contacts.getCluster(req.params.workspaceId, req.params.clusterId));
};

export const updateCluster = async (req, res) => {
  res.json(await contacts.updateCluster(req.params.workspaceId, req.params.clusterId, req.body));
};

export const deleteCluster = async (req, res) => {
  const deleteContacts = req.query.deleteContacts === 'true' || req.body?.deleteContacts === true;
  res.json(await contacts.deleteCluster(req.params.workspaceId, req.params.clusterId, { deleteContacts }));
};

export const removeFromCluster = async (req, res) => {
  res.json(await contacts.removeFromCluster(
    req.params.workspaceId, req.params.clusterId, asArray(req.body.contactIds),
  ));
};

export const previewClusters = async (req, res) => {
  const ids = req.method === 'GET' ? asArray(req.query.clusterIds) : asArray(req.body.clusterIds);
  res.json(await contacts.previewClusters(req.params.workspaceId, ids));
};

export const exportCluster = async (req, res) => {
  const { filename, csv } = await contacts.exportClusterCsv(req.params.workspaceId, req.params.clusterId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};
