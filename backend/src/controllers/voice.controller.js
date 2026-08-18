// backend/src/controllers/voice.controller.js
import {
  listVoices,
  getVoice,
  getProviderStatus,
  streamVoicePreview,
  syncVoices,
  searchProviderLibrary,
  importProviderVoice,
  setAgentVoice,
  getAgentVoice,
} from '../services/voice.service.js';
import { getEnabledCatalog } from '../services/platform/modelCatalog.js';

/** TTS provider names Super Admin currently allows clients to use. */
const enabledTtsProviders = async () => {
  const catalog = await getEnabledCatalog();
  return (catalog.tts ?? []).map((m) => m.value);
};

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
    const { page = '1', limit = '20', provider, gender, language, q } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);

    const { total, voices } = await listVoices({
      page: pageNum,
      limit: limitNum,
      provider: provider || undefined,
      gender: gender || undefined,
      language: language || undefined,
      q: q || undefined,
      allowedProviders: await enabledTtsProviders(),
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

// ─── GET /api/voices/library?provider=FishAudio&q=... ─────────────────────────
// Live search of the PROVIDER's catalogue, for voices the sync never pulled.
export const searchLibrary = async (req, res) => {
  try {
    const { provider, q, limit = '30' } = req.query;
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    if (!q || !String(q).trim()) return res.json({ voices: [] });

    // A disabled provider must not be searchable either, or the picker could
    // import from a provider Super Admin has switched off.
    const allowed = await enabledTtsProviders();
    if (!allowed.includes(provider)) return res.status(403).json({ error: `${provider} is not enabled` });

    const voices = await searchProviderLibrary({
      provider,
      q: String(q),
      limit: Math.min(50, parseInt(limit, 10) || 30),
    });
    res.json({ voices });
  } catch (error) {
    console.error('Error searching voice library:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Library search failed' });
  }
};

// ─── POST /api/voices/library/import ──────────────────────────────────────────
// Persist one library hit so it can be previewed and assigned. Idempotent.
export const importLibraryVoice = async (req, res) => {
  try {
    const { provider, providerVoiceId } = req.body ?? {};
    if (!provider || !providerVoiceId) {
      return res.status(400).json({ error: 'provider and providerVoiceId are required' });
    }
    const allowed = await enabledTtsProviders();
    if (!allowed.includes(provider)) return res.status(403).json({ error: `${provider} is not enabled` });

    const voice = await importProviderVoice({ provider, providerVoiceId });
    res.json({ success: true, voice: toDTO(voice) });
  } catch (error) {
    console.error('Error importing library voice:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Import failed' });
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
    const text = req.query.text || DEFAULT_PREVIEW_TEXT;
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
    const { agentId, workspaceId } = req.params;
    const { voiceId } = req.body;
    if (!voiceId) return res.status(400).json({ error: 'voiceId is required' });
    const { voice, label } = await setAgentVoice(agentId, voiceId, workspaceId);
    res.json({ success: true, voice: toDTO(voice), label });
  } catch (error) {
    console.error('Error setting agent voice:', error);
    // Not-found / cross-workspace are client errors; only anything else is a 500.
    res.status(error.status ?? 500).json({ error: error.message });
  }
};

// ─── GET /api/agents/:agentId/voice ───────────────────────────────────────────
export const getVoiceForAgent = async (req, res) => {
  try {
    const { agentId, workspaceId } = req.params;
    const voice = await getAgentVoice(agentId, workspaceId);
    if (!voice) return res.status(404).json({ error: 'No voice assigned to this agent' });
    res.json(voice);
  } catch (error) {
    console.error('Error fetching agent voice:', error);
    res.status(error.status ?? 500).json({ error: error.message });
  }
};
