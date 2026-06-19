import prisma from '../config/prisma.js';
import { getVoiceService } from '../services/voiceClone.service.js';
import {
  deleteAudioFile,
  saveAudioFile,
  validateAudioFile,
} from '../services/audioStorage.service.js';
import logger from '../lib/logger.js';

const parseJsonObject = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const createVoiceClone = async (req, res) => {
  const { workspaceId } = req.params;
  const { name, gender, language, description, provider, durationMs } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  if (!name) {
    return res.status(400).json({ error: 'Voice name is required' });
  }

  try {
    const activeProvider = (provider || process.env.VOICE_CLONING_PROVIDER || 'elevenlabs').toLowerCase();
    if (!['elevenlabs', 'sarvam'].includes(activeProvider)) {
      return res.status(400).json({ error: 'Unsupported voice cloning provider' });
    }

    const validation = await validateAudioFile(req.file.buffer, {
      durationMs: durationMs ? Number(durationMs) : undefined,
      minDurationMs: 20000,
      maxDurationMs: 120000,
      maxFileSizeBytes: 10 * 1024 * 1024,
    });

    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    logger.info({ workspaceId, name, activeProvider }, 'Creating voice clone');

    const service = getVoiceService(activeProvider);
    const savedAudio = await saveAudioFile(req.file.buffer, req.file.originalname, workspaceId);

    let result;
    try {
      result = await service.submitVoiceForCloning(req.file.buffer, {
        name,
        gender,
        language,
        description,
      });
    } catch (error) {
      await deleteAudioFile(savedAudio.storagePath).catch((deleteError) => {
        logger.warn({ deleteError }, 'Failed to clean up audio after clone submission failure');
      });
      throw error;
    }

    const voiceClone = await prisma.voiceClone.create({
      data: {
        workspaceId,
        name,
        voiceId: result.voiceCloneId,
        processingId: result.processingId || null,
        provider: activeProvider.toLowerCase() === 'sarvam' ? 'Sarvam' : 'ElevenLabs',
        gender: gender || 'Neutral',
        language: language || 'English',
        description: description || null,
        sampleUrl: savedAudio.publicUrl,
        samplePath: savedAudio.storagePath,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: savedAudio.fileSize,
        durationMs: validation.metadata?.durationMs || null,
        status: result.status || 'ready',
        metadataJson: JSON.stringify({
          uploadSource: req.body.source || null,
          cloningProvider: activeProvider,
        }),
      },
    });

    res.status(201).json(voiceClone);
  } catch (error) {
    logger.error({ err: error, workspaceId }, 'Failed to create voice clone controller');

    const status = error?.status || error?.response?.status || 500;
    const message =
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.response?.statusText ||
      error?.message ||
      'Failed to create voice clone';

    res.status(status).json({
      error: message,
      details: error?.response?.data || error?.details || null,
    });
  }
};

export const getVoiceClones = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const clones = await prisma.voiceClone.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(clones);
  } catch (error) {
    logger.error('Failed to get voice clones', error);
    res.status(500).json({ error: 'Failed to retrieve voice clones' });
  }
};

export const deleteVoiceClone = async (req, res) => {
  const { workspaceId, cloneId } = req.params;

  try {
    const clone = await prisma.voiceClone.findUnique({
      where: { id: cloneId },
    });

    if (!clone || clone.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'Voice clone not found' });
    }

    // Try deleting from ElevenLabs if it's not a mock voice clone
    if (clone.provider === 'ElevenLabs' && !clone.voiceId.startsWith('mock-')) {
      try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (apiKey) {
          await fetch(`https://api.elevenlabs.io/v1/voices/${clone.voiceId}`, {
            method: 'DELETE',
            headers: { 'xi-api-key': apiKey },
          });
          logger.info({ voiceId: clone.voiceId }, 'Deleted voice from ElevenLabs');
        }
      } catch (err) {
        logger.warn('Failed to delete voice from provider, proceeding with DB deletion', err);
      }
    }

    await prisma.voiceClone.delete({
      where: { id: cloneId },
    });

    if (clone.samplePath) {
      await deleteAudioFile(clone.samplePath).catch((err) => {
        logger.warn({ err, cloneId }, 'Failed to delete stored voice sample');
      });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete voice clone', error);
    res.status(500).json({ error: 'Failed to delete voice clone' });
  }
};

export const testVoiceClone = async (req, res) => {
  const { workspaceId, cloneId } = req.params;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Synthesis text is required' });
  }

  try {
    const clone = await prisma.voiceClone.findUnique({
      where: { id: cloneId },
    });

    if (!clone || clone.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'Voice clone not found' });
    }

    const providerName = clone.provider.toLowerCase();
    const service = getVoiceService(providerName);
    
    // Inject gender metadata to sandbox if applicable
    const testText = `${text} (Voice info: Gender is ${clone.gender})`;

    const result = await service.testVoiceClone(clone.voiceId, testText);
    res.json(result);
  } catch (error) {
    logger.error('Failed to test voice clone', error);
    res.status(500).json({ error: 'Failed to synthesize speech', details: error.message });
  }
};

export const refreshVoiceCloneStatus = async (req, res) => {
  const { workspaceId, cloneId } = req.params;

  try {
    const clone = await prisma.voiceClone.findUnique({
      where: { id: cloneId },
    });

    if (!clone || clone.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'Voice clone not found' });
    }

    if (!clone.processingId) {
      return res.json(clone);
    }

    const service = getVoiceService(clone.provider.toLowerCase());
    const status = await service.getCloneStatus(clone.processingId);

    const updatedClone = await prisma.voiceClone.update({
      where: { id: cloneId },
      data: {
        voiceId: status.voiceCloneId || clone.voiceId,
        status: status.status || clone.status,
        metadataJson: JSON.stringify({
          ...parseJsonObject(clone.metadataJson),
          progress: status.progress,
          providerError: status.error || null,
          lastStatusCheckedAt: new Date().toISOString(),
        }),
      },
    });

    res.json(updatedClone);
  } catch (error) {
    logger.error('Failed to refresh voice clone status', error);
    res.status(500).json({ error: 'Failed to refresh voice clone status', details: error.message });
  }
};
