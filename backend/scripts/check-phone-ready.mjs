#!/usr/bin/env node
/**
 * Can this machine place a real phone call right now, or must it be deployed first?
 *
 *   node --env-file=.env scripts/check-phone-ready.mjs
 *   node --env-file=.env scripts/check-phone-ready.mjs +919876543210
 *
 * WHY THIS EXISTS. A phone call touches four things a web call does not — a
 * carrier account, a publicly reachable answer URL, a public websocket for the
 * media stream, and a TTS provider able to emit a telephony format — and when
 * any one of them is missing locally the symptom is the same: the dial fails
 * somewhere inside a carrier's API and the only way to find out was to deploy
 * and try. That turns a thirty-second check into a deploy cycle per attempt.
 *
 * Everything here is read-only. It places no calls and spends nothing.
 */
import prisma from '../src/config/prisma.js';
import { resolveProvider, availableProviders } from '../src/services/telephony/index.js';
import { isDeepgramConfigured } from '../src/services/stt/deepgramStream.service.js';
import { supportsTelephony } from '../src/services/voice/telephonyAudio.js';

const OK = '  ok  ';
const BAD = ' FAIL ';
const WARN = ' warn ';
let blocking = 0;

const line = (mark, label, detail = '') => {
  if (mark === BAD) blocking += 1;
  console.log(`[${mark}] ${label}${detail ? `\n         ${detail}` : ''}`);
};

/** Which env vars a carrier needs, so a failure names the fix rather than the symptom. */
const CARRIER_ENV = {
  TWILIO: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  PLIVO: ['PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN', 'PLIVO_FROM_NUMBER'],
  PIOPIY: ['PIOPIY_APP_ID', 'PIOPIY_APP_SECRET', 'PIOPIY_FROM_NUMBER'],
};
const missingEnv = (id) => (CARRIER_ENV[id] || []).filter((k) => !process.env[k]);

console.log('\n── carriers configured on THIS machine ────────────────────────────\n');

// Driven off the registry, not a list kept by hand. A carrier that was wired
// up but left out of this array reported nothing here while its numbers still
// routed to it — which is exactly how PIOPIY went unnoticed.
const carriers = availableProviders().map((id) => resolveProvider(id));
const ready = new Set();
for (const p of carriers) {
  let status;
  try { status = await p.status(); } catch (err) { status = { ready: false, error: err.message }; }
  if (status.ready) {
    ready.add(p.id);
    line(OK, `${p.id} configured`);
  } else {
    const miss = missingEnv(p.id);
    // Not counted as blocking on its own: an unused carrier being unconfigured
    // is normal. What matters is whether a NUMBER routes to it — checked below.
    line(WARN, `${p.id} not usable here`, miss.length ? `missing: ${miss.join(', ')}` : (status.error || '').slice(0, 160));
  }
}

console.log('\n── how your numbers route ─────────────────────────────────────────\n');

const registry = availableProviders();
let numbers = [];
try {
  numbers = await prisma.voiceNumber.findMany({ take: 50 });
} catch (err) {
  line(WARN, 'could not read VoiceNumber rows', err.message.slice(0, 140));
}

const wanted = process.argv[2];
if (!numbers.length) {
  line(WARN, 'no VoiceNumber rows', `every caller ID falls back to TELEPHONY_PROVIDER_DEFAULT (${process.env.TELEPHONY_PROVIDER_DEFAULT || 'TWILIO'})`);
}
for (const n of numbers) {
  const num = n.number ?? n.e164 ?? n.phoneNumber ?? '(number column not recognised)';
  if (wanted && String(num) !== wanted) continue;
  const id = String(n.provider || '').toUpperCase();
  if (!registry.includes(id)) {
    // The registry falls back to Twilio for an unknown id (deliberately — see
    // resolveProvider — so a bad row cannot take a campaign down). That is the
    // right call at runtime and a trap in development: the call is placed on a
    // DIFFERENT carrier than the row says, and the error you get back is
    // Twilio's, about a carrier you never chose.
    line(BAD, `${num} → ${id}, which is NOT in the provider registry`,
      `resolveProvider() will silently fall back to TWILIO. Registered: ${registry.join(', ')}.`);
  } else if (!ready.has(id)) {
    line(BAD, `${num} → ${id}, which is not configured here`,
      `add ${(missingEnv(id).join(', ') || `${id} credentials`)} to backend/.env — this is what forces a deploy to test`);
  } else {
    line(OK, `${num} → ${id}, configured`);
  }
}

console.log('\n── the public address a carrier has to reach ──────────────────────\n');

const wsUrl = process.env.PUBLIC_BACKEND_WS_URL;
if (!wsUrl) {
  line(BAD, 'PUBLIC_BACKEND_WS_URL is not set',
    'a carrier fetches call XML and opens the media socket over this; run `npm run dev:tunnel` to get one');
} else {
  const httpBase = wsUrl.replace(/^ws(s)?:\/\//i, (_m, s) => (s ? 'https://' : 'http://')).replace(/\/$/, '');
  line(OK, `PUBLIC_BACKEND_WS_URL = ${wsUrl}`);

  const probe = async (url) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': '1' }, signal: AbortSignal.timeout(10_000) });
      await res.text();
      return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
    } catch (err) {
      return { ok: false, err: err.message, ms: Date.now() - t0 };
    }
  };

  const local = await probe(`http://localhost:${process.env.PORT || 4000}/health`);
  const via = await probe(`${httpBase}/health`);

  if (!local.ok) {
    line(BAD, 'the backend is not answering on localhost',
      `start it first (npm run dev). ${local.err || `HTTP ${local.status}`}`);
  } else {
    line(OK, `backend answering locally in ${local.ms}ms`);
  }

  if (!via.ok) {
    line(BAD, 'the public URL does not reach a backend',
      `${via.err || `HTTP ${via.status}`} — the tunnel is down, or PUBLIC_BACKEND_WS_URL points somewhere else`);
  } else {
    line(OK, `public URL answers in ${via.ms}ms`,
      via.ms - local.ms > 100
        ? `${via.ms - local.ms}ms of that is the hop itself, and phone audio crosses it ~50x/second in BOTH directions`
        : '');

    // Reachable is not the same as reaching THIS process. A tunnel left running
    // from an earlier session, or a URL still pointing at the deployed server,
    // answers perfectly well and sends every call somewhere else — which is
    // indistinguishable from "phone calls do not work locally" until you notice
    // your breakpoints never hit.
    //
    // ngrok's own local API is the only honest answer: it exists only in the
    // process running the tunnel, and it reports what that tunnel forwards to.
    // No answer means the tunnel is not running here.
    if (/ngrok/i.test(httpBase)) {
      try {
        const res = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(3000) });
        const { tunnels = [] } = await res.json();
        const mine = tunnels.find((t) => t.public_url && httpBase.includes(new URL(t.public_url).host));
        if (mine) line(OK, `the tunnel runs on this machine and forwards to ${mine.forwards_to}`);
        else line(BAD, 'a tunnel is running here, but not the one PUBLIC_BACKEND_WS_URL names',
          `running: ${tunnels.map((t) => t.public_url).join(', ') || '(none)'} — carriers are reaching a different backend`);
      } catch {
        line(BAD, 'the ngrok tunnel is NOT running on this machine',
          'that URL answers, so it points at a stale tunnel or the deployed server — your calls are not hitting this code. Run `npm run dev:tunnel`.');
      }
    }
  }
}

console.log('\n── the rest of the modular phone pipeline ─────────────────────────\n');

if (isDeepgramConfigured()) line(OK, 'Deepgram configured (streaming STT — the modular bridge requires it)');
else line(BAD, 'Deepgram not configured', 'set DEEPGRAM_API_KEY; the modular phone bridge refuses the call without it');

// A voice that cannot emit mu-law/PCM at the line rate is refused by the bridge
// at `start`, which presents as a call that connects and then says nothing.
try {
  const agents = await prisma.agent.findMany({ select: { id: true, name: true, voice: true }, take: 25 });
  const { resolveAgentVoice } = await import('../src/services/voice.service.js');
  const seen = new Map();
  for (const a of agents) {
    if (!a.voice || seen.has(a.voice)) continue;
    const v = await resolveAgentVoice(a.voice).catch(() => null);
    seen.set(a.voice, { provider: v?.provider?.name ?? null, agent: a.name });
  }
  for (const [label, { provider, agent }] of seen) {
    if (!provider) line(WARN, `voice "${label}" does not resolve`, `used by "${agent}"`);
    else if (supportsTelephony(provider)) line(OK, `${provider} can emit a telephony format (voice "${label}")`);
    else line(WARN, `${provider} CANNOT emit a telephony format`, `agents on voice "${label}" connect and then stay silent on the phone`);
  }
} catch (err) {
  line(WARN, 'could not check agent voices', err.message.slice(0, 140));
}

console.log('');
if (blocking) {
  console.log(`${blocking} blocking problem${blocking === 1 ? '' : 's'} — a phone call placed from this machine will fail.\n`);
} else {
  console.log('No blocking problems: this machine can place a real phone call without deploying.\n');
}
await prisma.$disconnect();
process.exit(blocking ? 1 : 0);
