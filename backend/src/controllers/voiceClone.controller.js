// Custom voice cloning (workspace-scoped).
//
// The uploaded sample is stored on disk and registered as a Voice under the
// "Custom" provider. Preview plays the actual uploaded sample. When an external
// cloning provider (e.g. ElevenLabs Instant Voice Clone, Cartesia) is
// configured, `submitToProvider` can push the sample upstream; until then the
// voice is fully usable for selection/preview and clearly marked
// status: "sample_only" — we never fake a cloned status.
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';

const CLONE_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'voice-clones');
fs.mkdirSync(CLONE_DIR, { recursive: true });

const AUDIO_MIMES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CLONE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.webm';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const uploadVoiceSample = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (AUDIO_MIMES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Only audio files (MP3, WAV, WEBM, OGG, M4A) are allowed'));
  },
  limits: { fileSize: (env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024 },
}).single('sample');

const getCustomProvider = async () => {
  return prisma.voiceProvider.upsert({
    where: { name: 'Custom' },
    update: {},
    create: { name: 'Custom', isActive: true },
  });
};

const parseMeta = (v) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };

/**
 * Submit the sample to a real cloning provider. Currently: ElevenLabs Instant
 * Voice Clone (POST /v1/voices/add, multipart). Returns { provider, providerVoiceId }
 * on success, or null when no cloning-capable provider key is configured.
 * Failures THROW so callers can report honestly — we never fake "cloned".
 */
const submitToProvider = async ({ filePath, mimeType, name, description }) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  const form = new FormData();
  form.append('name', name);
  if (description) form.append('description', description);
  form.append(
    'files',
    new Blob([fs.readFileSync(filePath)], { type: mimeType || 'audio/mpeg' }),
    path.basename(filePath)
  );

  const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  const bodyText = await res.text();
  if (!res.ok) {
    let msg = bodyText.slice(0, 300);
    try { msg = JSON.parse(bodyText)?.detail?.message || msg; } catch { /* raw */ }
    throw new Error(`ElevenLabs voice cloning failed (${res.status}): ${msg}`);
  }
  const data = JSON.parse(bodyText);
  return { provider: 'elevenlabs', providerVoiceId: data.voice_id };
};

// ── POST /workspaces/:workspaceId/voices/clone ────────────────────────────────
export const cloneVoice = async (req, res) => {
  const { workspaceId } = req.params;
  const { name, gender, language, description } = req.body;

  if (!req.file) return res.status(400).json({ error: 'An audio sample is required' });
  if (!name || !name.trim()) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Voice name is required' });
  }

  try {
    // Attempt REAL provider-side cloning first (ElevenLabs IVC) when a key is
    // configured. If it fails we still keep the sample, but the status and the
    // response say exactly what happened — no fake success.
    let cloned = null;
    let cloneError = null;
    try {
      cloned = await submitToProvider({
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        name: name.trim(),
        description,
      });
    } catch (provErr) {
      cloneError = provErr.message;
      logger.warn(`Provider cloning failed, keeping sample only: ${cloneError}`);
    }

    const provider = await getCustomProvider();
    const voice = await prisma.voice.create({
      data: {
        providerId: provider.id,
        providerVoiceId: cloned?.providerVoiceId ?? `custom-${workspaceId}-${Date.now()}`,
        name: name.trim(),
        language: language || null,
        gender: gender || null,
        category: 'cloned',
        workspaceId, // real column (indexed) — metadata copy kept for compat
        metadata: JSON.stringify({
          workspaceId,
          description: description || null,
          samplePath: path.basename(req.file.path),
          sampleMime: req.file.mimetype,
          sampleSize: req.file.size,
          status: cloned ? 'cloned' : 'sample_only',
          clonedProvider: cloned?.provider ?? null,
          clonedVoiceId: cloned?.providerVoiceId ?? null,
          cloneError,
          createdBy: req.user?.userId ?? null,
        }),
      },
    });

    res.status(201).json({
      success: true,
      voice: {
        id: voice.id,
        name: voice.name,
        gender: voice.gender,
        language: voice.language,
        category: voice.category,
        status: cloned ? 'cloned' : 'sample_only',
        createdAt: voice.createdAt,
      },
      message: cloned
        ? `Voice cloned successfully via ElevenLabs — it can now speak any text and is selectable in the agent voice picker.`
        : cloneError
          ? `Sample saved, but provider cloning failed: ${cloneError}. The sample is kept for preview; fix the provider issue and re-submit to clone.`
          : 'Sample saved. Add an ELEVENLABS_API_KEY to backend/.env to enable real neural cloning, then re-submit.',
    });
  } catch (err) {
    logger.error('cloneVoice failed', err);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to save cloned voice' });
  }
};

// ── GET /workspaces/:workspaceId/voices/cloned ────────────────────────────────
export const listClonedVoices = async (req, res) => {
  const { workspaceId } = req.params;
  try {
    const provider = await prisma.voiceProvider.findUnique({ where: { name: 'Custom' } });
    if (!provider) return res.json({ voices: [] });

    // Workspace filtering happens in the DATABASE via the indexed column —
    // no more full-table scan + JS filter.
    const rows = await prisma.voice.findMany({
      where: { providerId: provider.id, category: 'cloned', workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    const voices = rows
      .map((v) => ({ v, meta: parseMeta(v.metadata) }))
      .map(({ v, meta }) => ({
        id: v.id,
        name: v.name,
        gender: v.gender,
        language: v.language,
        description: meta.description ?? null,
        status: meta.status ?? 'sample_only',
        createdAt: v.createdAt,
      }));

    res.json({ voices });
  } catch (err) {
    logger.error('listClonedVoices failed', err);
    res.status(500).json({ error: 'Failed to list cloned voices' });
  }
};

// ── GET /workspaces/:workspaceId/voices/cloned/:id/sample ─────────────────────
export const streamClonedSample = async (req, res) => {
  const { workspaceId, id } = req.params;
  try {
    const voice = await prisma.voice.findUnique({ where: { id } });
    const meta = parseMeta(voice?.metadata);
    if (!voice || (voice.workspaceId ?? meta.workspaceId) !== workspaceId || !meta.samplePath) {
      return res.status(404).json({ error: 'Cloned voice not found' });
    }
    const filePath = path.join(CLONE_DIR, path.basename(meta.samplePath));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Sample file missing' });

    res.setHeader('Content-Type', meta.sampleMime || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error('streamClonedSample failed', err);
    res.status(500).json({ error: 'Failed to stream sample' });
  }
};

// ── DELETE /workspaces/:workspaceId/voices/cloned/:id ─────────────────────────
export const deleteClonedVoice = async (req, res) => {
  const { workspaceId, id } = req.params;
  try {
    const voice = await prisma.voice.findUnique({ where: { id } });
    const meta = parseMeta(voice?.metadata);
    if (!voice || (voice.workspaceId ?? meta.workspaceId) !== workspaceId) {
      return res.status(404).json({ error: 'Cloned voice not found' });
    }

    // Refuse deletion while an agent uses this voice (schema is onDelete: Restrict)
    const inUse = await prisma.agentVoice.count({ where: { voiceId: id } });
    if (inUse > 0) {
      return res.status(409).json({ error: 'This voice is assigned to an agent. Unassign it first.' });
    }

    await prisma.voice.delete({ where: { id } });
    if (meta.samplePath) {
      fs.unlink(path.join(CLONE_DIR, path.basename(meta.samplePath)), () => {});
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteClonedVoice failed', err);
    res.status(500).json({ error: 'Failed to delete cloned voice' });
  }
};
