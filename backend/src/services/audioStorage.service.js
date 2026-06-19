import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_STORAGE_PATH = process.env.AUDIO_STORAGE_PATH || path.join(__dirname, '../../uploads/voices');
const AUDIO_STORAGE_TYPE = process.env.AUDIO_STORAGE_TYPE || 'local'; // local, s3, azure

/**
 * Ensure storage directory exists
 */
async function ensureStorageDirectory() {
  try {
    await fs.mkdir(AUDIO_STORAGE_PATH, { recursive: true });
  } catch (error) {
    logger.error('Failed to create storage directory', error);
    throw error;
  }
}

/**
 * Save audio file to storage
 * @param {Buffer} buffer - Audio file buffer
 * @param {string} filename - Original filename
 * @param {string} workspaceId - Workspace ID for organization
 * @returns {Promise<{storagePath: string, fileSize: number, publicUrl?: string}>}
 */
export async function saveAudioFile(buffer, filename, workspaceId) {
  try {
    if (AUDIO_STORAGE_TYPE === 'local') {
      return await saveAudioFileLocal(buffer, filename, workspaceId);
    } else if (AUDIO_STORAGE_TYPE === 's3') {
      return await saveAudioFileS3(buffer, filename, workspaceId);
    } else if (AUDIO_STORAGE_TYPE === 'azure') {
      return await saveAudioFileAzure(buffer, filename, workspaceId);
    }

    throw new Error(`Unknown storage type: ${AUDIO_STORAGE_TYPE}`);
  } catch (error) {
    logger.error('Failed to save audio file', error);
    throw error;
  }
}

/**
 * Save audio file locally
 */
async function saveAudioFileLocal(buffer, filename, workspaceId) {
  try {
    await ensureStorageDirectory();

    // Create workspace subdirectory
    const workspaceDir = path.join(AUDIO_STORAGE_PATH, workspaceId);
    await fs.mkdir(workspaceDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = crypto.randomUUID();
    const safeName = path.basename(filename || 'voice-sample').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageName = `${timestamp}-${randomSuffix}-${safeName}`;
    const storagePath = path.join(workspaceDir, storageName);

    // Write file
    await fs.writeFile(storagePath, buffer);

    // Get file stats
    const stats = await fs.stat(storagePath);

    logger.info('Audio file saved locally', {
      filename,
      storagePath,
      fileSize: stats.size,
    });

    return {
      storagePath: path.relative(AUDIO_STORAGE_PATH, storagePath), // Relative path for DB storage
      fileSize: stats.size,
      publicUrl: null, // Local files aren't publicly accessible
    };
  } catch (error) {
    logger.error('Failed to save audio file locally', error);
    throw error;
  }
}

/**
 * Save audio file to AWS S3
 */
async function saveAudioFileS3(buffer, filename, workspaceId) {
  try {
    // Implement S3 upload using AWS SDK v3
    // This is a placeholder - adjust based on your S3 setup
    logger.info('S3 storage not yet implemented');
    throw new Error('S3 storage not yet implemented');
  } catch (error) {
    logger.error('Failed to save audio file to S3', error);
    throw error;
  }
}

/**
 * Save audio file to Azure Blob Storage
 */
async function saveAudioFileAzure(buffer, filename, workspaceId) {
  try {
    // Implement Azure Blob Storage upload
    // This is a placeholder - adjust based on your Azure setup
    logger.info('Azure storage not yet implemented');
    throw new Error('Azure storage not yet implemented');
  } catch (error) {
    logger.error('Failed to save audio file to Azure', error);
    throw error;
  }
}

/**
 * Retrieve audio file from storage
 * @param {string} storagePath - Storage path (relative path)
 * @returns {Promise<Buffer>}
 */
export async function getAudioFile(storagePath) {
  try {
    if (AUDIO_STORAGE_TYPE === 'local') {
      return await getAudioFileLocal(storagePath);
    }

    throw new Error(`Unknown storage type: ${AUDIO_STORAGE_TYPE}`);
  } catch (error) {
    logger.error('Failed to retrieve audio file', error);
    throw error;
  }
}

/**
 * Get audio file from local storage
 */
async function getAudioFileLocal(storagePath) {
  try {
    const fullPath = path.join(AUDIO_STORAGE_PATH, storagePath);
    const buffer = await fs.readFile(fullPath);
    return buffer;
  } catch (error) {
    logger.error('Failed to read audio file locally', error);
    throw error;
  }
}

/**
 * Delete audio file from storage
 * @param {string} storagePath - Storage path
 * @returns {Promise<void>}
 */
export async function deleteAudioFile(storagePath) {
  try {
    if (AUDIO_STORAGE_TYPE === 'local') {
      return await deleteAudioFileLocal(storagePath);
    }

    throw new Error(`Unknown storage type: ${AUDIO_STORAGE_TYPE}`);
  } catch (error) {
    logger.error('Failed to delete audio file', error);
    throw error;
  }
}

/**
 * Delete audio file from local storage
 */
async function deleteAudioFileLocal(storagePath) {
  try {
    const fullPath = path.join(AUDIO_STORAGE_PATH, storagePath);
    await fs.unlink(fullPath);
    logger.info('Audio file deleted', { storagePath });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Failed to delete audio file locally', error);
      throw error;
    }
    // File doesn't exist, which is fine
  }
}

/**
 * Extract audio metadata
 * Requires librosa or similar library to be installed
 * @param {Buffer} buffer - Audio buffer
 * @returns {Promise<{duration: number, sampleRate: number, channels: number, format: string}>}
 */
export async function getAudioMetadata(buffer) {
  try {
    // This would require librosa or soundfile to be properly configured
    // For now, return basic metadata
    // In production, you'd use: librosa.get_duration(y=y, sr=sr)
    
    logger.warn('Audio metadata extraction not fully implemented - returning estimates');

    // Simple placeholder: assume 16-bit PCM, mono, 16kHz
    // Real implementation would use librosa or soundfile
    const durationMs = (buffer.length / 2) / 16000 * 1000; // Rough estimate

    return {
      duration: durationMs,
      durationMs: Math.round(durationMs),
      sampleRate: 16000,
      channels: 1,
      format: 'wav',
    };
  } catch (error) {
    logger.error('Failed to extract audio metadata', error);
    // Return reasonable defaults on error
    return {
      duration: 0,
      durationMs: 0,
      sampleRate: 16000,
      channels: 1,
      format: 'wav',
    };
  }
}

/**
 * Validate audio file constraints
 * @param {Buffer} buffer - Audio buffer
 * @param {Object} constraints - Validation constraints
 * @returns {Object} Validation result with isValid and error message
 */
export async function validateAudioFile(buffer, constraints = {}) {
  try {
    const {
      minDurationMs = 20000, // 20 seconds
      maxDurationMs = 120000, // 2 minutes
      maxFileSizeBytes = 10 * 1024 * 1024, // 10MB
      durationMs,
    } = constraints;

    // Check file size
    if (buffer.length > maxFileSizeBytes) {
      return {
        isValid: false,
        error: `Audio file too large. Maximum: ${maxFileSizeBytes / 1024 / 1024}MB`,
      };
    }

    // Check audio duration
    const metadata = durationMs
      ? { ...(await getAudioMetadata(buffer)), durationMs: Number(durationMs), duration: Number(durationMs) }
      : await getAudioMetadata(buffer);
    if (metadata.durationMs < minDurationMs) {
      return {
        isValid: false,
        error: `Audio too short. Minimum: ${minDurationMs / 1000}s, Got: ${(metadata.durationMs / 1000).toFixed(1)}s`,
      };
    }

    if (metadata.durationMs > maxDurationMs) {
      return {
        isValid: false,
        error: `Audio too long. Maximum: ${maxDurationMs / 1000}s, Got: ${(metadata.durationMs / 1000).toFixed(1)}s`,
      };
    }

    return {
      isValid: true,
      metadata,
    };
  } catch (error) {
    logger.error('Audio validation failed', error);
    return {
      isValid: false,
      error: 'Audio validation failed: ' + error.message,
    };
  }
}

/**
 * Get storage info
 * @returns {Object} Storage configuration info
 */
export function getStorageInfo() {
  return {
    type: AUDIO_STORAGE_TYPE,
    path: AUDIO_STORAGE_PATH,
    config: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      minDuration: 20000, // 20 seconds
      maxDuration: 120000, // 2 minutes
      allowedFormats: ['wav', 'mp3', 'ogg', 'flac'],
    },
  };
}
