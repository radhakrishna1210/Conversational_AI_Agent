// Custom voice cloning (workspace-scoped).
//
// The uploaded sample is stored on disk and registered as a Voice under the
// "Custom" provider. Preview plays the actual uploaded sample. When an external
// cloning provider is configured (Fish Audio or ElevenLabs — see CLONERS),
// `submitToProvider` pushes the sample upstream and stores the returned
// persistent voice id; until then the voice is usable for preview only and
// clearly marked status: "sample_only" — we never fake a cloned status.
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';
import { getEnabledCatalog } from '../services/platform/modelCatalog.js';

export const CLONE_DIR = path.resolve(env.UPLOAD_DIR || 'uploads', 'voice-clones');
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

export const parseMeta = (v) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };

/** ElevenLabs Instant Voice Clone — POST /v1/voices/add, multipart. */
const submitToElevenLabs = async ({ filePath, mimeType, name, description }) => {
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
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  const bodyText = await res.text();
  if (!res.ok) {
    let msg = bodyText.slice(0, 300);
    try { msg = JSON.parse(bodyText)?.detail?.message || msg; } catch { /* raw */ }
    throw new Error(`ElevenLabs voice cloning failed (${res.status}): ${msg}`);
  }
  const data = JSON.parse(bodyText);
  return { providerVoiceId: data.voice_id };
};

/**
 * Fish Audio voice model creation — POST /model (note: NOT under /v1).
 * Returns a persistent `_id` that is passed as `reference_id` on every later
 * synthesis, so the voice is never re-uploaded per call.
 */
const submitToFishAudio = async ({ filePath, mimeType, name, description }) => {
  const form = new FormData();
  form.append('type', 'tts');
  form.append('title', name);
  if (description) form.append('description', description);
  form.append('train_mode', 'fast');
  form.append('enhance_audio_quality', 'true');
  form.append('visibility', process.env.FISH_CLONE_VISIBILITY || 'private');
  form.append(
    'voices',
    new Blob([fs.readFileSync(filePath)], { type: mimeType || 'audio/mpeg' }),
    path.basename(filePath)
  );

  const res = await fetch('https://api.fish.audio/model', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.FISH_API_KEY}` },
    body: form,
  });
  const bodyText = await res.text();
  if (!res.ok) {
    let msg = bodyText.slice(0, 300);
    try { msg = JSON.parse(bodyText)?.detail || JSON.parse(bodyText)?.message || msg; } catch { /* raw */ }
    throw new Error(`Fish Audio voice cloning failed (${res.status}): ${msg}`);
  }
  const data = JSON.parse(bodyText);
  if (!data?._id) throw new Error('Fish Audio cloning returned no model id');
  return { providerVoiceId: data._id, state: data.state ?? null };
};

// Cloning-capable providers, in default preference order.
//
// `catalogName` is the VoiceProvider / model-catalogue name of the SAME company:
// the provider that trains a clone is the provider that synthesizes it on every
// later call (see resolveSynthesisTarget), so cloning to one Super Admin has
// switched off would produce a voice that cannot be listed or spoken. `ttsModel`
// is the model that will actually run at call time — the unit the TTS bill is
// priced in, which is why the UI shows it before you clone.
const CLONERS = [
  {
    id: 'fishaudio',
    label: 'Fish Audio',
    catalogName: 'FishAudio',
    configured: () => Boolean(process.env.FISH_API_KEY),
    ttsModel: () => process.env.FISH_TTS_MODEL || 's2.1-pro',
    submit: submitToFishAudio,
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    catalogName: 'ElevenLabs',
    configured: () => Boolean(process.env.ELEVENLABS_API_KEY),
    ttsModel: () => process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
    submit: submitToElevenLabs,
  },
];

/**
 * A model id as shown to users. Fish Audio appends "-free" to the model name on
 * a free-tier key ("s2.1-pro-free"); that is a detail of which account we hold,
 * not something a customer should read off the product, so it is trimmed for
 * DISPLAY only. The real value still goes to the API — fishaudio.provider.js
 * keys its WebSocket model off that very suffix — and is what gets recorded in
 * the voice's metadata, so the audit trail keeps the truth.
 */
export const publicModelName = (id) => (id ? String(id).replace(/-free$/, '') : id);

/** Provider names Super Admin currently offers under Voice (TTS). */
const enabledTtsNames = async () => {
  try {
    const catalog = await getEnabledCatalog();
    return (catalog.tts ?? []).map((m) => m.value);
  } catch (err) {
    // A catalogue read failure must not block cloning outright; fall back to
    // "whatever has a key", which is the behaviour that predates this gate.
    logger.warn(`Model catalogue unavailable, cloning falls back to key presence: ${err.message}`);
    return null;
  }
};

/**
 * Which provider will train (and therefore speak, and therefore bill) a clone.
 *
 * Order: the caller's explicit choice → VOICE_CLONE_PROVIDER → first usable in
 * CLONERS order. A provider is usable only when it has a key AND is enabled in
 * the catalogue. Returns null when nothing qualifies.
 *
 * @param {{ preferred?: string, enabledNames?: string[]|null }} opts
 */
export const resolveCloner = ({ preferred, enabledNames } = {}) => {
  const usable = (c) =>
    c.configured() && (!Array.isArray(enabledNames) || enabledNames.includes(c.catalogName));
  const wanted = (preferred || process.env.VOICE_CLONE_PROVIDER || '').toLowerCase();
  return (wanted && CLONERS.find((c) => c.id === wanted && usable(c))) || CLONERS.find(usable) || null;
};

/**
 * Submit the sample to a real cloning provider — chosen by the request, else
 * VOICE_CLONE_PROVIDER, else the first one with a configured key. Returns
 * { provider, label, providerVoiceId, state } on success, or null when NO
 * provider is configured. Failures THROW so callers report honestly — we never
 * fake "cloned".
 *
 * Deliberately does NOT retry a different provider on failure: that burns quota
 * on a second account and reports an error from a provider the user didn't pick.
 */
const submitToProvider = async ({ filePath, mimeType, name, description, preferred, enabledNames }) => {
  const chosen = resolveCloner({ preferred, enabledNames });
  if (!chosen) return null;
  const out = await chosen.submit({ filePath, mimeType, name, description });
  return { provider: chosen.id, label: chosen.label, ttsModel: chosen.ttsModel(), ...out };
};

// ── Deletion helpers ─────────────────────────────────────────────────────────

/**
 * Remove the voice from the cloning provider that holds it. Deleting only our
 * row would leave the clone alive upstream — still billable, still listed in
 * the provider console, and still usable by anyone holding the id.
 */
const REMOTE_DELETERS = {
  fishaudio: async (id) => {
    if (!process.env.FISH_API_KEY) return 'FISH_API_KEY is not configured';
    const res = await fetch(`https://api.fish.audio/model/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.FISH_API_KEY}` },
    });
    // 404 means it is already gone, which is the state we wanted.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Fish Audio delete failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return null;
  },
  elevenlabs: async (id) => {
    if (!process.env.ELEVENLABS_API_KEY) return 'ELEVENLABS_API_KEY is not configured';
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`ElevenLabs delete failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return null;
  },
};

/**
 * Best-effort upstream deletion. Returns a human-readable reason when the
 * remote copy could NOT be removed, else null. Deliberately non-fatal: a
 * provider outage must not leave the user unable to remove their own voice
 * from the platform — but the caller reports the leftover honestly.
 */
export const deleteRemoteClone = async (meta) => {
  const provider = meta?.clonedProvider;
  const remoteId = meta?.clonedVoiceId;
  if (!provider || !remoteId) return null; // sample-only voice — nothing upstream
  const del = REMOTE_DELETERS[provider];
  if (!del) return `Unknown cloning provider "${provider}"`;
  try {
    return await del(remoteId);
  } catch (err) {
    logger.warn(`Remote clone deletion failed (${provider}/${remoteId}): ${err.message}`);
    return err.message;
  }
};

/**
 * Agents that would break if this voice went away.
 *
 * Agents do NOT hold a voice foreign key — `Agent.voice` is the display label
 * ("Custom - My Voice") that resolveAgentVoice() looks up by name at call time.
 * So the only truthful in-use check is a name match within the owning
 * workspace, which is what this does.
 */
export const agentsUsingVoice = async (voice) =>
  prisma.agent.findMany({
    where: {
      ...(voice.workspaceId ? { workspaceId: voice.workspaceId } : {}),
      voice: { contains: voice.name, mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });

/** Remove the stored sample file. Safe to call when there is no sample. */
export const removeSampleFile = (meta) => {
  if (!meta?.samplePath) return;
  fs.unlink(path.join(CLONE_DIR, path.basename(meta.samplePath)), () => {});
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
    const enabledNames = await enabledTtsNames();

    // The picker sends an explicit provider. Honour it or refuse it — silently
    // cloning to the other one would train the voice on a provider the user did
    // not choose and bill them for it.
    const preferred = String(req.body.cloneProvider || '').toLowerCase();
    if (preferred && resolveCloner({ preferred, enabledNames })?.id !== preferred) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        error: `${preferred} cannot clone right now — it has no API key configured, or it is switched off in Super Admin → Models. Pick another provider.`,
      });
    }

    // Attempt REAL provider-side cloning first (Fish Audio or ElevenLabs,
    // whichever is configured) when a key is present. If it fails we still keep
    // the sample, but the status and the response say exactly what happened —
    // no fake success.
    let cloned = null;
    let cloneError = null;
    try {
      cloned = await submitToProvider({
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        name: name.trim(),
        description,
        preferred,
        enabledNames,
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
          // Fish reports a training state; 'fast' clones are usable at once but
          // record it so a future async-training state is diagnosable.
          cloneState: cloned?.state ?? null,
          // The model that will run at call time. Recorded per voice because
          // FISH_TTS_MODEL / ELEVENLABS_TTS_MODEL can change later, and the
          // TTS bill for calls made BEFORE that change was priced on this one.
          ttsModel: cloned?.ttsModel ?? null,
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
        clonedProvider: cloned?.provider ?? null,
        providerLabel: cloned?.label ?? null,
        ttsModel: publicModelName(cloned?.ttsModel ?? null),
        createdAt: voice.createdAt,
      },
      message: cloned
        ? `Voice cloned successfully via ${cloned.label} (${publicModelName(cloned.ttsModel)}) — it can now speak any text and is selectable in the agent voice picker.`
        : cloneError
          ? `Sample saved, but provider cloning failed: ${cloneError}. The sample is kept for preview; fix the provider issue and re-submit to clone.`
          : 'Sample saved. Add a FISH_API_KEY or ELEVENLABS_API_KEY to backend/.env to enable real neural cloning, then re-submit.',
    });
  } catch (err) {
    logger.error('cloneVoice failed', err);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to save cloned voice' });
  }
};

// ── GET /workspaces/:workspaceId/voices/clone/providers ───────────────────────
/**
 * Which TTS provider a clone created right now would train on, speak with, and
 * be billed by — plus why the others are unavailable.
 *
 * The page used to say nothing about this, so nobody could tell whether a new
 * clone would cost Fish Audio minutes or ElevenLabs characters until after it
 * existed. Computed with the SAME resolver the upload path uses, so the answer
 * shown cannot drift from the answer applied.
 */
export const cloneProviderInfo = async (req, res) => {
  try {
    const enabledNames = await enabledTtsNames();
    const active = resolveCloner({ enabledNames });
    const pinned = (process.env.VOICE_CLONE_PROVIDER || '').toLowerCase();

    const providers = CLONERS.map((c) => {
      const configured = c.configured();
      const enabled = !Array.isArray(enabledNames) || enabledNames.includes(c.catalogName);
      return {
        id: c.id,
        label: c.label,
        ttsModel: publicModelName(c.ttsModel()),
        configured,
        enabled,
        usable: configured && enabled,
        active: active?.id === c.id,
        // One plain reason, so the UI never has to guess at the combination.
        unavailableReason: configured
          ? (enabled ? null : `${c.label} is switched off in Super Admin → Models`)
          : `No API key configured for ${c.label}`,
      };
    });

    res.json({
      active: active
        ? { id: active.id, label: active.label, ttsModel: publicModelName(active.ttsModel()) }
        : null,
      // 'env' means an operator pinned the choice; 'default' means it fell to
      // preference order, so adding a key could change who serves the next clone.
      source: active ? (pinned === active.id ? 'env' : 'default') : null,
      providers,
    });
  } catch (err) {
    logger.error('cloneProviderInfo failed', err);
    res.status(500).json({ error: 'Failed to resolve the cloning provider' });
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
        // The UI needs these to decide which delete actions to offer: the
        // sample can only be dropped on its own once a real clone exists.
        hasSample: Boolean(meta.samplePath),
        clonedProvider: meta.clonedProvider ?? null,
        // Which provider/model will run — and be billed — every time an agent
        // speaks with this voice.
        providerLabel: CLONERS.find((c) => c.id === meta.clonedProvider)?.label ?? null,
        ttsModel: publicModelName(meta.ttsModel ?? null),
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

    // Refuse deletion while an agent still points at this voice — the agent
    // would silently fall back to a different voice mid-call.
    const inUse = await agentsUsingVoice(voice);
    if (inUse.length > 0) {
      return res.status(409).json({
        error: `This voice is used by ${inUse.map((a) => `"${a.name}"`).join(', ')}. Switch ${inUse.length > 1 ? 'those agents' : 'that agent'} to another voice first.`,
        agents: inUse,
      });
    }

    // Upstream first: if our row is gone we lose the id needed to reach it.
    const remoteError = await deleteRemoteClone(meta);

    await prisma.voice.delete({ where: { id } });
    removeSampleFile(meta);

    res.json({
      success: true,
      remoteError,
      message: remoteError
        ? `Voice removed here, but the copy at the cloning provider could not be deleted: ${remoteError}`
        : 'Voice and uploaded sample deleted.',
    });
  } catch (err) {
    logger.error('deleteClonedVoice failed', err);
    res.status(500).json({ error: 'Failed to delete cloned voice' });
  }
};

// ── DELETE /workspaces/:workspaceId/voices/cloned/:id/sample ───────────────────
/**
 * Drop only the uploaded recording, keeping the working clone. Once a provider
 * has trained the voice the sample is used for nothing but the preview button,
 * so people who do not want their raw recording sitting on the server can
 * remove it without losing the voice.
 */
export const deleteClonedSample = async (req, res) => {
  const { workspaceId, id } = req.params;
  try {
    const voice = await prisma.voice.findUnique({ where: { id } });
    const meta = parseMeta(voice?.metadata);
    if (!voice || (voice.workspaceId ?? meta.workspaceId) !== workspaceId) {
      return res.status(404).json({ error: 'Cloned voice not found' });
    }
    if (!meta.samplePath) {
      return res.status(404).json({ error: 'This voice has no stored sample' });
    }
    // Without a provider-side clone the sample IS the voice — removing it would
    // leave a row that can neither speak nor preview.
    if (meta.status !== 'cloned') {
      return res.status(409).json({
        error: 'This voice was never cloned by a provider, so the sample is all there is. Delete the whole voice instead.',
      });
    }

    removeSampleFile(meta);
    await prisma.voice.update({
      where: { id },
      data: {
        metadata: JSON.stringify({
          ...meta,
          samplePath: null,
          sampleMime: null,
          sampleSize: null,
          sampleDeletedAt: new Date().toISOString(),
        }),
      },
    });

    res.json({ success: true, message: 'Uploaded sample deleted. The cloned voice still works.' });
  } catch (err) {
    logger.error('deleteClonedSample failed', err);
    res.status(500).json({ error: 'Failed to delete the uploaded sample' });
  }
};
