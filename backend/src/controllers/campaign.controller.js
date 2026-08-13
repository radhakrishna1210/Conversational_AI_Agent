import * as campaignService from '../services/campaign.service.js';
import * as contactService from '../services/contact.service.js';
import { readCsvRows } from './contact.controller.js';
import { unlink } from 'fs/promises';

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

const parseJsonArray = (raw, field) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map((v) => String(v).trim()).filter(Boolean);
  } catch {
    throw Object.assign(new Error(`${field} must be a JSON array`), { statusCode: 400 });
  }
};

/**
 * Create a bulk-call campaign from either an existing cluster selection or a
 * fresh CSV.
 *
 * Both doors lead to the same place: an uploaded file is imported into a cluster
 * first, and the campaign is then built from cluster ids. So a CSV run once is
 * still a named, reusable list afterwards — which is the whole point, and the
 * reason this endpoint no longer parses phone numbers itself.
 */
export const createBulkCampaign = async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const { campaignName, botId, concurrentCalls } = req.body;
  const name = String(campaignName ?? '').trim();

  try {
    if (!name) {
      throw Object.assign(new Error('Campaign name is required'), { statusCode: 400 });
    }

    let clusterIds = parseJsonArray(req.body.clusterIds, 'clusterIds');
    let importSummary = null;

    if (req.file) {
      const rows = await readCsvRows(req.file.path);
      const { cluster, summary } = await contactService.importContacts(workspaceId, rows, {
        // The list is named for the campaign by default, because that is how
        // people will look for it later ("the Diwali one"). Renameable from the
        // Contacts page, and de-duplicated against existing names on the way in.
        clusterName: String(req.body.clusterName ?? '').trim() || name || req.file.originalname,
        csvFileName: req.file.originalname,
        source: contactService.CLUSTER_SOURCE.CAMPAIGN_CSV,
      });
      clusterIds = [...clusterIds, cluster.id];
      importSummary = summary;
    }

    if (!clusterIds.length) {
      throw Object.assign(
        new Error('Pick at least one contact cluster, or upload a CSV'),
        { statusCode: 400 },
      );
    }

    // Caller IDs arrive as a JSON array (multipart makes repeated fields
    // awkward). Rotating across several numbers spreads outbound volume, which
    // is what keeps a bulk campaign from being flagged as spam.
    const fromNumbers = parseJsonArray(req.body.fromNumbers, 'fromNumbers');

    const campaign = await campaignService.createBulkCampaign(workspaceId, {
      name,
      botId: botId ? String(botId).trim() : null,
      clusterIds,
      fromNumbers,
      // Kept in sync so the campaigns table has something to show in its
      // "From Number" column without unpacking the array.
      fromNumber: fromNumbers[0] ?? null,
      csvFileName: req.file?.originalname ?? null,
      concurrentCalls: Number(concurrentCalls) || 1,
      progress: 0,
      status: 'DRAFT',
    });

    res.status(201).json({ ...campaign, importSummary });
  } finally {
    if (req.file) await unlink(req.file.path).catch(() => {});
  }
};

export const syncCampaignList = async (req, res) => {
  res.json(await campaignService.syncCampaignList(req.params.workspaceId, req.params.campaignId));
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
