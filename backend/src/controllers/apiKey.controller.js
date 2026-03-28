import * as apiKeyService from '../services/apiKey.service.js';

export const listKeys = async (req, res) => {
  const keys = await apiKeyService.listApiKeys(req.params.workspaceId);
  res.json(keys);
};

export const createKey = async (req, res) => {
  const { name, environment } = req.body;
  const key = await apiKeyService.createApiKey(req.params.workspaceId, name, environment);
  res.status(201).json(key); // rawKey included only here
};

export const rotateKey = async (req, res) => {
  const key = await apiKeyService.rotateApiKey(req.params.workspaceId, req.params.keyId);
  res.json(key);
};

export const revokeKey = async (req, res) => {
  await apiKeyService.revokeApiKey(req.params.workspaceId, req.params.keyId);
  res.json({ message: 'API key revoked' });
};
