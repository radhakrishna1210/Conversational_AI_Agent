import * as templateService from '../services/template.service.js';

export const listTemplates = async (req, res) => {
  const templates = await templateService.listTemplates(req.params.workspaceId, req.query);
  res.json(templates);
};

export const getTemplate = async (req, res) => {
  const template = await templateService.getTemplate(req.params.workspaceId, req.params.templateId);
  res.json(template);
};

export const createTemplate = async (req, res) => {
  const template = await templateService.createTemplate(req.params.workspaceId, req.body);
  res.status(201).json(template);
};

export const updateTemplate = async (req, res) => {
  const template = await templateService.updateTemplate(
    req.params.workspaceId, req.params.templateId, req.body
  );
  res.json(template);
};

export const deleteTemplate = async (req, res) => {
  await templateService.deleteTemplate(req.params.workspaceId, req.params.templateId);
  res.json({ message: 'Template deleted' });
};

export const duplicateTemplate = async (req, res) => {
  const template = await templateService.duplicateTemplate(
    req.params.workspaceId, req.params.templateId
  );
  res.status(201).json(template);
};
