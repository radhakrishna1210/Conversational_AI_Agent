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
  id: 'TWILIO',
  label: 'modular phone call',

  // Twilio echoes back the `<Parameter name="callLogId">` embedded in the TwiML
  // as `start.customParameters`, so the id arrives with the stream itself.
  readStart: (msg) => ({
    streamId: msg.start?.streamSid || msg.streamSid || null,
    callLogId: msg.start?.customParameters?.callLogId || null,
    // The live call's own id — what a human handover redirects (see
    // services/telephony/transfer.service.js) — and, on a socket opened by the
    // resume document after a failed handover, how that handover ended.
    carrierCallId: msg.start?.callSid || null,
    transferOutcome: msg.start?.customParameters?.transferOutcome || null,
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

export function handleTwilioMediaModularUpgrade(ws, { workspaceId, agentId, direction = null }) {
  return runModularMediaBridge(ws, { workspaceId, agentId, direction, carrier: twilioCarrier });
}
