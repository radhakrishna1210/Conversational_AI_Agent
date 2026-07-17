// backend/src/controllers/voice.controller.js
import {
  listVoices,
  getVoice,
  getProviderStatus,
  streamVoicePreview,
  syncVoices,
  setAgentVoice,
  getAgentVoice,
} from '../services/voice.service.js';

const DEFAULT_PREVIEW_TEXT =
  'Hello, thank you for calling. How can I assist you today?';

/** Map a DB voice row to a clean DTO (no providerId exposed). */
function toDTO(v) {
  if (!v) return null;
  return {
    id: v.id,
    provider: v.provider?.name ?? null,
    providerVoiceId: v.providerVoiceId,
    name: v.name,
    language: v.language,
    accent: v.accent,
    gender: v.gender,
    category: v.category,
    metadata: v.metadata ? (() => { try { return JSON.parse(v.metadata); } catch { return v.metadata; } })() : null,
  };
}

// ─── GET /api/voice/providers/status ─────────────────────────────────────────
export const providerStatus = async (req, res) => {
  try {
    const status = await getProviderStatus();
    res.json(status);
  } catch (error) {
    console.error('Error fetching provider status:', error);
    res.status(500).json({ error: 'Failed to fetch provider status' });
  }
};

// ─── GET /api/voices ──────────────────────────────────────────────────────────
export const list = async (req, res) => {
  try {
    const { page = '1', limit = '20', provider, gender, language } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);

    const { total, voices } = await listVoices({
      page: pageNum,
      limit: limitNum,
      provider: provider || undefined,
      gender: gender || undefined,
      language: language || undefined,
    });

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      voices: voices.map(toDTO),
    });
  } catch (error) {
    console.error('Error listing voices:', error);
    res.status(500).json({ error: 'Failed to list voices' });
  }
};

// ─── GET /api/voices/:id ──────────────────────────────────────────────────────
export const get = async (req, res) => {
  try {
    const voice = await getVoice(req.params.id);
    if (!voice) return res.status(404).json({ error: 'Voice not found' });
    res.json(toDTO(voice));
  } catch (error) {
    console.error('Error fetching voice:', error);
    res.status(500).json({ error: 'Failed to fetch voice' });
  }
};

// ─── GET /api/voices/:id/preview ─────────────────────────────────────────────
export const preview = async (req, res) => {
  try {
    const { id } = req.params;
    const text = req.body?.text || req.query.text || DEFAULT_PREVIEW_TEXT;
    const { stream, contentType } = await streamVoicePreview(id, text);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  } catch (error) {
    console.error('Error streaming preview:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─── POST /api/voices/sync ────────────────────────────────────────────────────
export const sync = async (req, res) => {
  try {
    const { provider } = req.body;   // optional: restrict to one provider
    const results = await syncVoices(provider || undefined);
    const summary = results.reduce(
      (acc, r) => ({ added: acc.added + r.added, updated: acc.updated + r.updated, total: acc.total + r.total }),
      { added: 0, updated: 0, total: 0 }
    );
    res.json({ success: true, summary, providers: results });
  } catch (error) {
    console.error('Error syncing voices:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
};

// ─── PUT /api/agents/:agentId/voice ───────────────────────────────────────────
export const setVoice = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { voiceId } = req.body;
    if (!voiceId) return res.status(400).json({ error: 'voiceId is required' });
    const agentVoice = await setAgentVoice(agentId, voiceId);
    res.json({ success: true, agentVoice: toDTO(agentVoice.voice) });
  } catch (error) {
    console.error('Error setting agent voice:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/agents/:agentId/voice ───────────────────────────────────────────
export const getVoiceForAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const voice = await getAgentVoice(agentId);
    if (!voice) return res.status(404).json({ error: 'No voice assigned to this agent' });
    res.json(voice);
  } catch (error) {
    console.error('Error fetching agent voice:', error);
    res.status(500).json({ error: error.message });
  }
};
