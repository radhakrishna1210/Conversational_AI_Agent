import * as settingsService from '../services/settings.service.js';

export const getSettings = async (req, res) => {
  const settings = await settingsService.getSettings(req.params.workspaceId);
  res.json(settings);
};

export const updateSettings = async (req, res) => {
  const settings = await settingsService.updateSettings(req.params.workspaceId, req.body);
  res.json(settings);
};

export const listInvoices = async (req, res) => {
  const invoices = await settingsService.listInvoices(req.params.workspaceId);
  res.json(invoices);
};
