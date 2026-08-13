// backend/src/ws/plivoMediaModular.handler.js
/**
 * Plivo AudioStream <-> MODULAR (STT -> LLM -> TTS) agent bridge.
 *   /api/v1/plivo-media/:workspaceId/:agentId?callLogId=…
 *
 * The bridge itself lives in ws/modularMediaBridge.js — this file is only
 * Plivo's envelope. Protocol:
 * https://www.plivo.com/docs/voice-agents/audio-streaming/concepts/audio-streaming-reference
 *
 * Plivo streams mu-law 8 kHz, which is exactly what the shared bridge already
 * speaks in both directions, so there is no transcode and no pacer here — the
 * frame splitter in telephonyAudio.js already emits the 20ms frames Plivo
 * expects. (Exotel needs a pacer because it takes PCM16 in 320-byte multiples
 * and hangs up on a burst; Plivo does not.)
 *
 * Three differences from Twilio, all of them silent failures if got wrong:
 *
 *   1. `playAudio` carries an explicit contentType and sampleRate on EVERY
 *      frame, and they must agree with the `contentType` on the `<Stream>`
 *      element that opened the socket. Both constants come from
 *      plivo.provider.js so there is one definition.
 *   2. The flush is `clearAudio` keyed by `streamId`, not `clear` by streamSid.
 *   3. There is NO per-call parameter on `start` — Plivo has no equivalent of
 *      Twilio's customParameters — so the call log id arrives on the socket URL
 *      and `readStart` deliberately returns none.
 *
 * Plivo also never sends a `stop` event; the shared bridge finalizes on socket
 * close, which is the only end-of-call signal that exists here.
 */

import { runModularMediaBridge } from './modularMediaBridge.js';
import { STREAM_CONTENT_TYPE, STREAM_SAMPLE_RATE } from '../services/telephony/plivo.provider.js';

/** Exported for the adapter tests; the bridge takes it via `carrier`. */
export const plivoCarrier = {
  label: 'Plivo modular phone call',

  readStart: (msg) => ({
    streamId: msg.start?.streamId || msg.streamId || null,
    // Deliberately null: see (3) above. Returning null leaves the id the
    // upgrade handler read off the query string in place.
    callLogId: null,
  }),

  sendAudio: (ws, _streamId, frame) => {
    ws.send(JSON.stringify({
      event: 'playAudio',
      media: {
        contentType: STREAM_CONTENT_TYPE,
        sampleRate: STREAM_SAMPLE_RATE,
        payload: frame.toString('base64'),
      },
    }));
  },

  clearAudio: (ws, streamId) => {
    ws.send(JSON.stringify({ event: 'clearAudio', streamId }));
  },
};

export function handlePlivoMediaModularUpgrade(ws, { workspaceId, agentId, callLogId = null }) {
  return runModularMediaBridge(ws, { workspaceId, agentId, callLogId, carrier: plivoCarrier });
}
