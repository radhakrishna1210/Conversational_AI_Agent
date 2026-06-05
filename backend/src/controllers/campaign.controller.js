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
    const campaign = await campaignService.createBulkCampaign(req.params.workspaceId, {
      name: String(campaignName ?? '').trim(),
      botId: botId ? String(botId).trim() : null,
      phoneNumbers,
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
