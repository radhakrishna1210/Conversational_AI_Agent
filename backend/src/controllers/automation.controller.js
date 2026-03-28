import * as automationService from '../services/automation.service.js';

export const listTriggers = async (req, res) => {
  const triggers = await automationService.listTriggers(req.params.workspaceId);
  res.json(triggers);
};

export const createTrigger = async (req, res) => {
  const trigger = await automationService.createTrigger(req.params.workspaceId, req.body);
  res.status(201).json(trigger);
};

export const updateTrigger = async (req, res) => {
  const trigger = await automationService.updateTrigger(
    req.params.workspaceId, req.params.triggerId, req.body
  );
  res.json(trigger);
};

export const deleteTrigger = async (req, res) => {
  await automationService.deleteTrigger(req.params.workspaceId, req.params.triggerId);
  res.json({ message: 'Trigger deleted' });
};

export const getFlow = async (req, res) => {
  const flow = await automationService.getFlow(req.params.workspaceId);
  res.json(flow);
};

export const saveFlow = async (req, res) => {
  const flow = await automationService.saveFlow(req.params.workspaceId, req.body.flowJson);
  res.json(flow);
};
