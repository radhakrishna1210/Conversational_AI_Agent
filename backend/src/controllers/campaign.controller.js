import * as campaignService from '../services/campaign.service.js';

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
