// backend/src/services/voice/realtimeEngine.factory.js
/**
 * Picks the bundled speech-to-speech engine session for an agent's
 * settings.voiceEngine. Both session classes share the same EventEmitter
 * interface (connect/sendAudioChunk/on('audio')/on('transcript')/close), so
 * the WS bridge handlers (webCallRealtime.handler.js,
 * twilioMediaRealtime.handler.js) never need to know which engine is active.
 */

import { XaiRealtimeSession } from './xaiRealtime.service.js';
import { ElevenLabsRealtimeSession } from './elevenLabsRealtime.service.js';

/**
 * @param {'xai'|'elevenlabs'} engine
 * @param {{ agent: object, kbText: string, audioFormat: 'g711_ulaw'|'pcm16' }} opts
 */
export function createRealtimeSession(engine, opts) {
  switch (engine) {
    case 'xai':
      return new XaiRealtimeSession(opts);
    case 'elevenlabs':
      return new ElevenLabsRealtimeSession(opts);
    default:
      throw new Error(`Unknown conversational agent engine: "${engine}"`);
  }
}
