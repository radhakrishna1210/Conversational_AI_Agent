import * as campaignService from '../services/campaign.service.js';
import { parseCsvFile, normalisePhone } from '../lib/csvParser.js';
import { unlink } from 'fs/promises';

const parseUploadPhoneNumbers = async (filePath) => {
  const numbers = new Set();
  for await (const row of parseCsvFile(filePath)) {
    const raw = row.phone ?? row.phoneNumber ?? row.number ?? row.mobile ?? Object.values(row)[0];
    const normalized = normalisePhone(raw);
    if (normalized) {
      numbers.add(normalized);
    }
  }
  return Array.from(numbers);
};

export const listCampaigns = async (req, res) => {
  const campaigns = await campaignService.listCampaigns(req.params.workspaceId);
  res.json(campaigns);
};

export const getCampaign = async (req, res) => {
  const campaign = await campaignService.getCampaign(req.params.workspaceId, req.params.campaignId);
  res.json(campaign);
};

export const createCampaign = async (req, res) => {
  const campaign = await campaignService.createCampaign(req.params.workspaceId, req.body);
  res.status(201).json(campaign);
};

export const createBulkCampaign = async (req, res) => {
  if (!req.file) {
    throw Object.assign(new Error('CSV file is required'), { statusCode: 400 });
  }

  try {
    const phoneNumbers = await parseUploadPhoneNumbers(req.file.path);
    if (!phoneNumbers.length) {
      throw Object.assign(new Error('No valid phone numbers found in CSV'), { statusCode: 400 });
    }

    const { campaignName, botId, concurrentCalls } = req.body;

    // Caller IDs arrive as a JSON array (multipart makes repeated fields
    // awkward). Rotating across several numbers spreads outbound volume, which
    // is what keeps a bulk campaign from being flagged as spam.
    let fromNumbers = [];
    try {
      const raw = req.body.fromNumbers;
      if (raw) fromNumbers = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('fromNumbers must be a JSON array of phone numbers'), { statusCode: 400 });
    }
    fromNumbers = fromNumbers.map((n) => String(n).trim()).filter(Boolean);

    const campaign = await campaignService.createBulkCampaign(req.params.workspaceId, {
      name: String(campaignName ?? '').trim(),
      botId: botId ? String(botId).trim() : null,
      phoneNumbers,
      fromNumbers,
      // Kept in sync so the campaigns table has something to show in its
      // "From Number" column without unpacking the array.
      fromNumber: fromNumbers[0] ?? null,
      csvFileName: req.file.originalname,
      concurrentCalls: Number(concurrentCalls) || 1,
      progress: 0,
      status: 'DRAFT',
    });

    res.status(201).json(campaign);
  } finally {
    await unlink(req.file.path).catch(() => {});
  }
};

export const updateCampaign = async (req, res) => {
  const campaign = await campaignService.updateCampaign(req.params.workspaceId, req.params.campaignId, req.body);
  res.json(campaign);
};

export const deleteCampaign = async (req, res) => {
  await campaignService.deleteCampaign(req.params.workspaceId, req.params.campaignId);
  res.json({ message: 'Campaign deleted' });
};

export const startCampaign = async (req, res) => {
  const campaign = await campaignService.startCampaign(req.params.workspaceId, req.params.campaignId);
  res.json(campaign);
};

export const pauseCampaign = async (req, res) => {
  const campaign = await campaignService.pauseCampaign(req.params.workspaceId, req.params.campaignId);
  res.json(campaign);
};

// Tells the UI what a campaign will actually DO before it is launched: a modular
// agent cannot hold a two-way phone conversation, so its calls play the welcome
// message and hang up. Better to say so up front than after 10,000 dials.
export const previewCampaignMode = async (req, res) => {
  const preview = await campaignService.previewCampaignMode(
    req.params.workspaceId, req.query.agentId,
  );
  res.json(preview);
};

export const addRecipients = async (req, res) => {
  const { contactIds } = req.body;
  const campaign = await campaignService.addRecipients(
    req.params.workspaceId, req.params.campaignId, contactIds
  );
  res.json(campaign);
};

export const launchCampaign = async (req, res) => {
  const campaign = await campaignService.launchCampaign(
    req.params.workspaceId, req.params.campaignId, req.body.scheduledAt
  );
  res.json(campaign);
};

export const cancelCampaign = async (req, res) => {
  const campaign = await campaignService.cancelCampaign(
    req.params.workspaceId, req.params.campaignId
  );
  res.json(campaign);
};

export const getCampaignStats = async (req, res) => {
  const stats = await campaignService.getCampaignStats(
    req.params.workspaceId, req.params.campaignId
  );
  res.json(stats);
};
