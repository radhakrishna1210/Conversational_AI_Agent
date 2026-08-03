#!/usr/bin/env node
/**
 * Fish Audio live-API probe. Answers the questions the published docs do NOT,
 * so the provider integration can be corrected against reality rather than
 * assumption. No database, no app state — just the Fish API.
 *
 *   node --env-file=.env scripts/probe-fish.js [--save]
 *
 * Reports:
 *   1. GET /model      — the model-listing response shape (its reference page
 *                        404s, so fromFishAudioVoice() is inferred).
 *   2. POST /v1/tts    — status / content-type / TTFB per model header, so the
 *                        s2.1-pro default can be confirmed and timed.
 *   3. WS /v1/tts/live — whether the `model` header accepts s2.1-pro (docs list
 *                        only s1 / s2-pro there) and time-to-first-audio.
 *   4. Emotion tags    — whether "(cheerful) ..." is HONORED or SPOKEN ALOUD,
 *                        per model. --save writes the audio for a listen.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const KEY = process.env.FISH_API_KEY;
const SAVE = process.argv.includes('--save');
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'fish-probe');
const MODELS = ['s2.1-pro', 's2-pro', 's1'];
const SENTENCE = 'Sure, I can help you with that right away.';

if (!KEY) {
  console.error('FISH_API_KEY is not set. Add it to backend/.env, then re-run.');
  process.exit(1);
}

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ── 1. Model listing shape ───────────────────────────────────────────────────
async function probeListing() {
  console.log('\n── 1. GET /model (voice library shape) ──');
  for (const query of ['self=true&page_size=3', 'visibility=public&sort_by=score&page_size=3']) {
    try {
      const res = await fetch(`https://api.fish.audio/model?${query}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      console.log(`  ?${query}`);
      console.log(`    status: ${res.ok ? ok(res.status) : bad(res.status)}`);
      if (!res.ok) { console.log(`    body: ${text.slice(0, 300)}`); continue; }
      let data;
      try { data = JSON.parse(text); } catch { console.log(`    ${bad('non-JSON response')}: ${text.slice(0, 200)}`); continue; }
      const envelope = Array.isArray(data) ? '(bare array)' : Object.keys(data).join(', ');
      const items = data?.items ?? data?.data ?? data?.models ?? (Array.isArray(data) ? data : []);
      console.log(`    top-level keys: ${envelope}`);
      console.log(`    items: ${items.length}`);
      if (items[0]) {
        console.log(`    item keys: ${ok(Object.keys(items[0]).join(', '))}`);
        const s = items[0];
        console.log(dim(`    sample: _id=${s._id ?? s.id} title=${JSON.stringify(s.title ?? s.name)} ` +
          `languages=${JSON.stringify(s.languages ?? s.language)} tags=${JSON.stringify(s.tags)} ` +
          `visibility=${s.visibility} state=${s.state}`));
      }
    } catch (err) {
      console.log(`  ?${query}: ${bad('FAILED')} ${err.message}`);
    }
  }
  console.log(dim('  → Compare "item keys" against fromFishAudioVoice() in voice.dto.js.'));
}

// ── 2. HTTP TTS per model ────────────────────────────────────────────────────
async function probeHttp() {
  console.log('\n── 2. POST /v1/tts (HTTP streaming TTFB per model) ──');
  const results = {};
  for (const model of MODELS) {
    const started = performance.now();
    try {
      const res = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, model, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: SENTENCE, format: 'mp3', mp3_bitrate: 64, sample_rate: 24000,
          latency: 'balanced', chunk_length: 150, prosody: { speed: 1.0, volume: 0 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok || !res.body) {
        const body = await res.text();
        console.log(`  ${model.padEnd(10)} ${bad(res.status)} ${body.slice(0, 200)}`);
        continue;
      }
      let ttfb = null; let bytes = 0;
      for await (const chunk of res.body) {
        if (ttfb == null) ttfb = Math.round(performance.now() - started);
        bytes += chunk.length;
      }
      const total = Math.round(performance.now() - started);
      results[model] = { ttfb, total, bytes };
      console.log(`  ${model.padEnd(10)} ${ok('200')} ttfb=${ok(ttfb + 'ms')} total=${total}ms ` +
        `bytes=${bytes} content-type=${res.headers.get('content-type')}`);
    } catch (err) {
      console.log(`  ${model.padEnd(10)} ${bad('FAILED')} ${err.message}`);
    }
  }
  console.log(dim('  → Baseline to beat (measured this repo): Sarvam TTFB 305-640ms single.'));
  return results;
}

// ── 3. WebSocket TTS per model header ────────────────────────────────────────
function probeWsModel(model) {
  return new Promise(async (resolve) => {
    let encode; let decode;
    try { ({ encode, decode } = await import('@msgpack/msgpack')); }
    catch { return resolve({ model, error: '@msgpack/msgpack not installed' }); }

    const started = performance.now();
    let firstAudio = null; let bytes = 0; let settled = false;
    const done = (extra) => {
      if (settled) return; settled = true;
      try { ws.close(); } catch { /* noop */ }
      resolve({ model, firstAudio, bytes, ...extra });
    };

    const ws = new WebSocket('wss://api.fish.audio/v1/tts/live', {
      headers: { Authorization: `Bearer ${KEY}`, model },
    });
    const timer = setTimeout(() => done({ error: 'timeout after 20s' }), 20_000);

    ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { clearTimeout(timer); done({ handshake: res.statusCode, error: body.slice(0, 200) }); });
    });
    ws.on('open', () => {
      ws.send(encode({
        event: 'start',
        request: {
          text: '', format: 'mp3', mp3_bitrate: 64, sample_rate: 24000,
          latency: 'balanced', chunk_length: 150, prosody: { speed: 1.0, volume: 0 },
        },
      }));
      ws.send(encode({ event: 'text', text: SENTENCE + ' ' }));
      ws.send(encode({ event: 'flush' }));
      ws.send(encode({ event: 'stop' }));
    });
    ws.on('message', (raw) => {
      let msg;
      try { msg = decode(raw); } catch { return; }
      if (msg?.event === 'audio' && msg.audio) {
        if (firstAudio == null) firstAudio = Math.round(performance.now() - started);
        bytes += msg.audio.length ?? msg.audio.byteLength ?? 0;
      } else if (msg?.event === 'finish') {
        clearTimeout(timer);
        done({ reason: msg.reason });
      }
    });
    ws.on('error', (err) => { clearTimeout(timer); done({ error: err.message }); });
    ws.on('close', () => { clearTimeout(timer); done({}); });
  });
}

async function probeWs() {
  console.log('\n── 3. WS /v1/tts/live (does the `model` header accept each?) ──');
  for (const model of MODELS) {
    const r = await probeWsModel(model);
    if (r.error) {
      console.log(`  ${model.padEnd(10)} ${bad('REJECTED')} ${r.handshake ? `HTTP ${r.handshake} ` : ''}${r.error}`);
    } else if (r.firstAudio == null) {
      console.log(`  ${model.padEnd(10)} ${bad('no audio')} reason=${r.reason ?? 'closed'}`);
    } else {
      console.log(`  ${model.padEnd(10)} ${ok('OK')} first-audio=${ok(r.firstAudio + 'ms')} bytes=${r.bytes} reason=${r.reason ?? 'closed'}`);
    }
  }
  console.log(dim('  → Set FISH_TTS_WS_MODEL to the fastest model that returns OK.'));
}

// ── 4. Emotion tags: honored or spoken aloud? ────────────────────────────────
async function probeEmotionTags() {
  console.log('\n── 4. Emotion tags — honored, or read out loud? ──');
  if (SAVE) fs.mkdirSync(OUT_DIR, { recursive: true });
  const plain = 'Hello there.';
  const tagged = '(cheerful) Hello there.';

  for (const model of ['s1', 's2.1-pro']) {
    const sizes = {};
    for (const [label, text] of [['plain', plain], ['tagged', tagged]]) {
      try {
        const res = await fetch('https://api.fish.audio/v1/tts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${KEY}`, model, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, format: 'mp3', mp3_bitrate: 64, sample_rate: 24000, latency: 'normal' }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) { console.log(`  ${model} ${label}: ${bad(res.status)}`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        sizes[label] = buf.length;
        if (SAVE) {
          const f = path.join(OUT_DIR, `${model}-${label}.mp3`);
          fs.writeFileSync(f, buf);
        }
      } catch (err) {
        console.log(`  ${model} ${label}: ${bad('FAILED')} ${err.message}`);
      }
    }
    if (sizes.plain && sizes.tagged) {
      const growth = (sizes.tagged - sizes.plain) / sizes.plain;
      // "(cheerful) " is ~3 spoken syllables; if it were spoken the clip would
      // grow markedly. A near-identical length means the tag was consumed.
      const verdict = growth > 0.25
        ? bad(`likely SPOKEN ALOUD (+${Math.round(growth * 100)}% audio)`)
        : ok(`likely consumed as a tag (${growth >= 0 ? '+' : ''}${Math.round(growth * 100)}%)`);
      console.log(`  ${model.padEnd(10)} plain=${sizes.plain}b tagged=${sizes.tagged}b → ${verdict}`);
    }
  }
  console.log(dim(`  → Length is a heuristic. ${SAVE ? `Listen to the files in ${OUT_DIR}` : 'Re-run with --save to listen'} before enabling FISH_EMOTION_TAGS.`));
}

await probeListing();
await probeHttp();
await probeWs();
await probeEmotionTags();
console.log('\nDone. Update fishaudio.provider.js / voice.dto.js against anything that differs.\n');
process.exit(0);
