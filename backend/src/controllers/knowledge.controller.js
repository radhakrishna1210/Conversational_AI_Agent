import logger from '../lib/logger.js';
import * as knowledgeService from '../services/knowledge.service.js';

export const list = async (req, res) => {
  const docs = await knowledgeService.listKnowledgeDocuments(req.params.workspaceId);
  res.json({ documents: docs });
};

export const upload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const result = await knowledgeService.ingestKnowledgeDocument(
      req.params.workspaceId,
      req.file,
      req.body?.title || ''
    );
    res.status(201).json({
      success: true,
      document: result.document,
      chunkCount: result.chunks.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Knowledge upload failed');
    res.status(500).json({ error: error.message || 'Failed to ingest document' });
  }
};

export const remove = async (req, res) => {
  await knowledgeService.deleteKnowledgeDocument(req.params.workspaceId, req.params.documentId);
  res.json({ success: true });
};

export const search = async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Query is required' });
  const matches = await knowledgeService.findRelevantKnowledge(req.params.workspaceId, query, Number(req.query.limit) || 4);
  res.json({ matches, context: knowledgeService.buildKnowledgeContext(matches) });
};
