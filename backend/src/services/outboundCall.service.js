// Shared outbound (Twilio) dialling for agent calls.
//
// Extracted from agent.controller.testCall so the "Test call" button and the
// bulk-campaign worker place calls through ONE code path. Anything that changes
// how a call is set up — TwiML, the media-stream handoff, call-log creation —
// changes for both at once.
//
// This module deliberately does NOT gate on plan/balance: the test-call
// controller and the campaign worker gate at different granularities (per press
// vs per batch), and both do it BEFORE calling here, while refusing is still
// free. Once Twilio is asked to dial, the carrier leg is billable to us.

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';

const BUNDLED_ENGINES = new Set(['xai', 'elevenlabs']);

const parseSettings = (agent) => {
  try { return JSON.parse(agent.settings || '{}'); } catch { return {}; }
};

/**
 * Can this agent hold a real two-way phone conversation?
 *
 * Only the bundled realtime engines (xAI / ElevenLabs Conversational Agent) can:
 * they bridge Twilio Media Streams to the provider's own session. A modular
 * (STT→LLM→TTS) agent has no telephony bridge, so a phone call to it can only
 * play a one-way greeting. That is a product limitation, not a config mistake —
 * surface it rather than letting someone dial 10,000 people expecting a
 * conversation and getting a recorded message.
 *
 * @returns {{ mode: 'conversation'|'greeting', engine: string, reason: string }}
 */
export function resolveCallMode(agent) {
  const settings = parseSettings(agent);
  const engine = settings.voiceEngine || 'modular';

  if (!BUNDLED_ENGINES.has(engine)) {
    return {
      mode: 'greeting',
      engine,
      reason: `This agent uses the ${engine} voice pipeline, which has no telephony bridge. `
        + 'Phone calls will play its welcome message and hang up. For a two-way phone '
        + 'conversation, set the agent\'s voice engine to a Conversational Agent (xAI or ElevenLabs).',
    };
  }
  if (!env.PUBLIC_BACKEND_WS_URL) {
    return {
      mode: 'greeting',
      engine,
      reason: `This agent uses the ${engine} Conversational Agent, but PUBLIC_BACKEND_WS_URL is not `
        + 'configured, so Twilio has no public wss:// address to stream audio to. Calls will play '
        + 'the welcome message only.',
    };
  }
  return { mode: 'conversation', engine, reason: '' };
}

/** True when Twilio credentials + a usable caller ID are present. */
export function telephonyStatus(fromNumber) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return {
      ready: false,
      error: 'Phone calling is not configured on this server (missing TWILIO_ACCOUNT_SID / '
        + 'TWILIO_AUTH_TOKEN). Use the Chat Test tab to test the agent, or configure Twilio.',
    };
  }
  if (!(fromNumber || process.env.TWILIO_FROM_NUMBER)) {
    return {
      ready: false,
      error: 'TWILIO_FROM_NUMBER is not set. Add a Twilio phone number you own to backend/.env.',
    };
  }
  return { ready: true, accountSid, authToken };
}

// Twilio's TwiML is XML: an unescaped & or < in a welcome message breaks the
// document and the call fails with a Twilio parse error instead of speaking.
const xmlSafe = (s) => String(s ?? '').replace(/[<>&]/g, ' ').slice(0, 800);

/**
 * Place one outbound call.
 *
 * @param {object}  p
 * @param {string}  p.workspaceId
 * @param {object}  p.agent          Agent row
 * @param {string}  p.toNumber       destination, E.164
 * @param {string}  [p.fromNumber]   caller ID; falls back to TWILIO_FROM_NUMBER
 * @param {string}  [p.closingLine]  spoken after the greeting on greeting-only calls
 * @param {string}  [p.callLogId]    reuse an existing log instead of creating one
 * @returns {Promise<{ok: boolean, callSid?: string, mode: string, callLogId?: string,
 *                    error?: string, status?: number}>}
 */
export async function placeOutboundCall({
  workspaceId,
  agent,
  toNumber,
  fromNumber,
  closingLine = '',
  callLogId = null,
}) {
  const tw = telephonyStatus(fromNumber);
  if (!tw.ready) return { ok: false, mode: 'none', error: tw.error, status: 503 };

  const from = fromNumber || process.env.TWILIO_FROM_NUMBER;
  const { mode } = resolveCallMode(agent);
  const useBundledEngine = mode === 'conversation';

  // Pre-create the call log so its id can be handed to the Twilio Media Stream
  // bridge (as a <Parameter>) for the bundled-engine branch to update in place.
  let logId = callLogId;
  if (!logId) {
    const created = await prisma.agentCallLog.create({
      data: {
        workspaceId,
        agentId: agent.id,
        type: 'PHONE_CALL',
        status: 'INITIATED',
        phoneNumber: String(toNumber).slice(0, 32),
      },
    }).catch((e) => { logger.warn(`Could not pre-create phone call log: ${e.message}`); return null; });
    logId = created?.id ?? null;
  }

  let twiml;
  let greeting = '';
  if (useBundledEngine) {
    // Full two-way conversation: hand the call to the bundled Conversational
    // Agent bridge (ws/twilioMediaRealtime.handler.js) via Twilio Media Streams.
    const streamUrl = `${env.PUBLIC_BACKEND_WS_URL.replace(/\/$/, '')}/api/v1/twilio-media/${workspaceId}/${agent.id}`;
    twiml = `<Response><Connect><Stream url="${streamUrl}">${logId ? `<Parameter name="callLogId" value="${logId}" />` : ''}</Stream></Connect></Response>`;
  } else {
    greeting = xmlSafe(agent.welcomeMessage || `Hello, this is a call from ${agent.name}.`);
    const closing = closingLine ? `<Pause length="1"/><Say voice="Polly.Aditi">${xmlSafe(closingLine)}</Say>` : '';
    twiml = `<Response><Say voice="Polly.Aditi">${greeting}</Say>${closing}</Response>`;
  }

  try {
    const credentials = Buffer.from(`${tw.accountSid}:${tw.authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${tw.accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: toNumber, From: from, Twiml: twiml }),
      },
    );

    const dataText = await response.text();
    let dataJson = {};
    try { dataJson = JSON.parse(dataText); } catch { /* not json */ }

    if (!response.ok) {
      logger.warn({ status: response.status, dataJson }, 'Twilio call request failed');
      if (logId) {
        // billingStatus must be closed out here too. Twilio rejected the
        // dispatch so nobody ever spoke and there is nothing to charge — but
        // left at its PENDING default the row reads as an unpaid call forever,
        // since no settlement path ever revisits a call that never connected.
        await prisma.agentCallLog.update({
          where: { id: logId },
          data: { status: 'FAILED', endedAt: new Date(), billingStatus: 'SKIPPED' },
        }).catch(() => {});
      }
      return {
        ok: false,
        mode,
        callLogId: logId,
        status: 502,
        error: `Twilio rejected the call: ${dataJson.message || response.status}. Check your Twilio `
          + 'number, account balance, and destination format (+countrycode...).',
      };
    }

    // Nothing else will update a greeting-only log — the media bridge finalizes
    // the bundled-engine one.
    if (!useBundledEngine && logId) {
      await prisma.agentCallLog.update({
        where: { id: logId },
        data: {
          transcript: JSON.stringify([{ role: 'assistant', content: greeting }]),
          endedAt: new Date(),
        },
      }).catch((e) => logger.warn(`Could not log phone call: ${e.message}`));
    }

    return { ok: true, callSid: dataJson.sid, mode, callLogId: logId };
  } catch (err) {
    logger.error('placeOutboundCall failed', err);
    if (logId) {
      // Same as the rejection path above: the call never happened, so close the
      // billing state rather than leaving it PENDING forever.
      await prisma.agentCallLog.update({
        where: { id: logId },
        data: { status: 'FAILED', endedAt: new Date(), billingStatus: 'SKIPPED' },
      }).catch(() => {});
    }
    return { ok: false, mode, callLogId: logId, status: 502, error: `Call failed: ${err.message}` };
  }
}
