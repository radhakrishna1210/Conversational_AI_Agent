// backend/src/ws/twilioMediaModular.handler.js
/**
 * Twilio Media Streams <-> MODULAR (STT -> LLM -> TTS) agent bridge.
 *   /api/v1/twilio-media/:workspaceId/:agentId
 *
 * The bridge itself lives in ws/modularMediaBridge.js — this file is only
 * Twilio's envelope. Protocol:
 * https://www.twilio.com/docs/voice/media-streams/websocket-messages
 */

import { runModularMediaBridge } from './modularMediaBridge.js';

/** Exported for the adapter tests; the bridge takes it via `carrier`. */
export const twilioCarrier = {
  label: 'modular phone call',

  // Twilio echoes back the `<Parameter name="callLogId">` embedded in the TwiML
  // as `start.customParameters`, so the id arrives with the stream itself.
  readStart: (msg) => ({
    streamId: msg.start?.streamSid || msg.streamSid || null,
    callLogId: msg.start?.customParameters?.callLogId || null,
  }),

  sendAudio: (ws, streamId, frame) => {
    ws.send(JSON.stringify({
      event: 'media',
      streamSid: streamId,
      media: { payload: frame.toString('base64') },
    }));
  },

  clearAudio: (ws, streamId) => {
    ws.send(JSON.stringify({ event: 'clear', streamSid: streamId }));
  },
};

export function handleTwilioMediaModularUpgrade(ws, { workspaceId, agentId }) {
  return runModularMediaBridge(ws, { workspaceId, agentId, carrier: twilioCarrier });
}
