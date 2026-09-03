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
 * speaks in both directions, so there is no transcode here.
 *
 * THERE IS A PACER, THOUGH — `pacedOutbound` below. An earlier version of this
 * comment said there was not, reasoning that the frame splitter in
 * telephonyAudio.js already emits the 20ms frames Plivo expects and that a clock
 * is only needed by carriers that hang up on a burst. That conflated
 * frame SIZE with frame CADENCE: the splitter sizes frames correctly but the
 * bridge then sent them as fast as TTS produced them. Plivo consumes at a fixed
 * 20ms cadence and, per their support, "perceived latency grows proportionally
 * to how deep the buffer gets" — it accepts the burst and plays progressively
 * further behind instead of failing. See services/voice/ulawPacer.js.
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
  id: 'PLIVO',
  label: 'Plivo modular phone call',

  /** Plivo penalises a burst with latency rather than failing it. See header. */
  pacedOutbound: true,

  readStart: (msg) => ({
    streamId: msg.start?.streamId || msg.streamId || null,
    // Deliberately null: see (3) above. Returning null leaves the id the
    // upgrade handler read off the query string in place.
    callLogId: null,
    // The live call's id, which a human handover redirects through Plivo's
    // Transfer API; the numbers, when the start event carries them, give the
    // <Dial> a legitimate caller id without a lookup.
    carrierCallId: msg.start?.callId || msg.start?.callUUID || null,
    from: msg.start?.from || null,
    to: msg.start?.to || null,
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

export function handlePlivoMediaModularUpgrade(ws, { workspaceId, agentId, callLogId = null, direction = null, transferOutcome = null }) {
  return runModularMediaBridge(ws, { workspaceId, agentId, callLogId, direction, carrier: plivoCarrier, transferOutcome });
}
