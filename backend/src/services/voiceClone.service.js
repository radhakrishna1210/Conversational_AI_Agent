import fetch from 'node-fetch';
import logger from '../lib/logger.js';
import crypto from 'crypto';

/**
 * Sarvam AI Voice Cloning Service Integration
 * Handles voice cloning submission, status tracking, and TTS synthesis
 */
export class SarvamVoiceService {
  constructor() {
    this.baseUrl = process.env.SARVAM_API_URL || 'https://api.sarvam.ai';
    this.apiKey = process.env.SARVAM_API_KEY;
    
    if (!this.apiKey || this.apiKey === 'mock') {
      logger.warn('Sarvam API key not configured, running in SANDBOX mode');
    }
  }

  /**
   * Submit voice sample for cloning
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {Object} metadata - Voice metadata (name, gender, language, etc)
   * @returns {Promise<{voiceCloneId: string, processingId: string, status: string}>}
   */
  async submitVoiceForCloning(audioBuffer, metadata = {}) {
    if (!this.apiKey || this.apiKey === 'mock') {
      logger.info('[SANDBOX] Simulating Sarvam voice cloning submission');
      const mockVoiceId = `mock-sarvam-${crypto.randomUUID()}`;
      return {
        voiceCloneId: mockVoiceId,
        processingId: `mock-proc-${crypto.randomUUID()}`,
        status: 'ready',
      };
    }

    try {
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      
      formData.append('audio', audioBlob, 'voice_sample.wav');
      formData.append('name', metadata.name || 'Voice Clone');
      if (metadata.gender) formData.append('gender', metadata.gender);
      if (metadata.language) formData.append('language', metadata.language);

      const response = await fetch(`${this.baseUrl}/voice-clone/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Sarvam API error: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('Voice submitted to Sarvam', { processingId: data.processing_id });

      return {
        voiceCloneId: data.voice_clone_id,
        processingId: data.processing_id,
        status: data.status || 'processing',
      };
    } catch (error) {
      logger.error('Failed to submit voice to Sarvam', error);
      throw error;
    }
  }

  /**
   * Check status of voice cloning process
   * @param {string} processingId - Processing ID from submission
   * @returns {Promise<{status: string, progress: number, voiceCloneId: string, error?: string}>}
   */
  async getCloneStatus(processingId) {
    if (!this.apiKey || this.apiKey === 'mock' || processingId.startsWith('mock-')) {
      return {
        status: 'ready',
        progress: 100,
        voiceCloneId: processingId.startsWith('mock-proc-') 
          ? processingId.replace('mock-proc-', 'mock-sarvam-')
          : processingId,
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/voice-clone/status?processing_id=${processingId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Sarvam API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        status: data.status, // "processing", "ready", "failed"
        progress: data.progress || 0,
        voiceCloneId: data.voice_clone_id,
        error: data.error_message,
      };
    } catch (error) {
      logger.error('Failed to get clone status from Sarvam', error);
      throw error;
    }
  }

  /**
   * Generate TTS with cloned voice for testing
   * @param {string} voiceCloneId - Voice clone ID
   * @param {string} text - Text to synthesize
   * @returns {Promise<{audioUrl: string, duration: number}>}
   */
  async testVoiceClone(voiceCloneId, text) {
    if (!this.apiKey || this.apiKey === 'mock' || voiceCloneId.startsWith('mock-')) {
      logger.info('[SANDBOX] Simulating Sarvam voice test');
      const isMale = text.toLowerCase().includes('male') || text.toLowerCase().includes('man');
      const sampleUrl = isMale
        ? 'https://samples.elevenlabs.io/adam.mp3'
        : 'https://samples.elevenlabs.io/bella.mp3';
      
      return {
        audioUrl: sampleUrl,
        duration: 5,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/tts/synthesis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice_id: voiceCloneId,
          text: text,
          language: 'en-US',
        }),
      });

      if (!response.ok) {
        throw new Error(`Sarvam TTS error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        audioUrl: data.audio_url,
        duration: data.duration || 0,
      };
    } catch (error) {
      logger.error('Failed to test voice clone', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature from Sarvam
   * @param {string} signature - Signature from webhook header
   * @param {string} payload - Raw webhook payload
   * @returns {boolean}
   */
  verifyWebhookSignature(signature, payload) {
    try {
      const secret = process.env.SARVAM_WEBHOOK_SECRET;
      if (!secret) return false;
      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      return signature === hash;
    } catch (error) {
      logger.error('Webhook signature verification failed', error);
      return false;
    }
  }
}

/**
 * ElevenLabs Voice Cloning Service (Alternative)
 * Handles voice cloning for ElevenLabs API
 */
export class ElevenLabsVoiceService {
  constructor() {
    this.baseUrl = 'https://api.elevenlabs.io';
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!this.apiKey || this.apiKey === 'mock') {
      logger.warn('ElevenLabs API key not configured, running in SANDBOX mode');
    }
  }

  async submitVoiceForCloning(audioBuffer, metadata = {}) {
    if (!this.apiKey || this.apiKey === 'mock') {
      logger.info('[SANDBOX] Simulating ElevenLabs voice cloning submission');
      const mockVoiceId = `mock-elevenlabs-${crypto.randomUUID()}`;
      return {
        voiceCloneId: mockVoiceId,
        processingId: mockVoiceId,
        status: 'ready',
      };
    }

    try {
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      
      formData.append('files', audioBlob, 'sample.wav');
      formData.append('name', metadata.name || 'Voice Clone');
      if (metadata.description) {
        formData.append('description', metadata.description);
      }

      const response = await fetch(
        `${this.baseUrl}/v1/voices/add`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs API error (${response.status}): ${errText || response.statusText}`);
      }

      const data = await response.json();

      return {
        voiceCloneId: data.voice_id,
        processingId: data.voice_id,
        status: 'ready',
      };
    } catch (error) {
      logger.error('Failed to submit voice to ElevenLabs', error);
      throw error;
    }
  }

  async getCloneStatus(voiceId) {
    if (!this.apiKey || this.apiKey === 'mock' || voiceId.startsWith('mock-')) {
      return {
        status: 'ready',
        progress: 100,
        voiceCloneId: voiceId,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/voices/${voiceId}`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        status: 'ready',
        progress: 100,
        voiceCloneId: data.voice_id,
      };
    } catch (error) {
      logger.error('Failed to get voice status from ElevenLabs', error);
      throw error;
    }
  }

  async testVoiceClone(voiceCloneId, text) {
    if (!this.apiKey || this.apiKey === 'mock' || voiceCloneId.startsWith('mock-')) {
      logger.info('[SANDBOX] Simulating ElevenLabs voice test');
      const isMale = text.toLowerCase().includes('male') || text.toLowerCase().includes('man');
      const sampleUrl = isMale
        ? 'https://samples.elevenlabs.io/adam.mp3'
        : 'https://samples.elevenlabs.io/bella.mp3';
      
      return {
        audioUrl: sampleUrl,
        duration: 5,
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/v1/text-to-speech/${voiceCloneId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_monolingual_v1',
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs TTS error (${response.status}): ${errText || response.statusText}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

      return {
        audioUrl,
        duration: 0,
      };
    } catch (error) {
      logger.error('Failed to test voice with ElevenLabs', error);
      throw error;
    }
  }
}

/**
 * Factory function to get appropriate voice service
 * @param {string} provider - Service provider name
 * @returns {SarvamVoiceService | ElevenLabsVoiceService}
 */
export function getVoiceService(provider = 'sarvam') {
  if (provider === 'sarvam') {
    return new SarvamVoiceService();
  } else if (provider === 'elevenlabs') {
    return new ElevenLabsVoiceService();
  }
  
  throw new Error(`Unknown voice provider: ${provider}`);
}

/**
 * Get default voice service from environment
 * @returns {SarvamVoiceService | ElevenLabsVoiceService}
 */
export function getDefaultVoiceService() {
  const provider = process.env.VOICE_CLONING_PROVIDER || 'elevenlabs';
  return getVoiceService(provider);
}
