#!/usr/bin/env node
// backend/scripts/measure-webcall.mjs
//
// End-to-end latency harness for the modular WEB CALL transport, driven the way
// a browser drives it: one WebSocket per call, `auth` → `ready`, then per turn
// `start-turn` + real-time paced PCM16 frames of a recorded utterance, silence
// until the server commits the turn, and the reply back as audio-start /
// binary chunks / audio-end / done.
//
//   node --env-file=.env scripts/measure-webcall.mjs \
//     --url ws://localhost:4100 --workspace ws_test_latency --agent agent_test_latency \
//     --samples <dir of 24kHz mono PCM16 WAVs> --turns 30 --label after --out <dir>
//
// What it measures (all on the harness's own monotonic clock):
//   speechEndToEndpointMs        last speech byte sent → server's `endpoint` frame
//   speechEndToFirstAudioMs      last speech byte sent → first reply-audio BINARY
//                                frame received (any segment, filler included)
//   speechEndToFirstReplyAudioMs same, first NON-filler segment — this is the
//                                ACTUAL latency at the client's socket boundary,
//                                before browser decode/scheduling (which the
//                                in-page `turn-timing` measurement covers)
//
// One JSONL row per turn, keyed by the server's turnId so the pipeline record
// in logs/latency.log can be joined (scripts/latency-report.mjs --harness).
//
// Never writes to the database: no `call-log` frame is sent, so the server has
// nothing to finalize or bill. Provider quota IS spent (Deepgram, LLM, TTS).
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { signAccessToken } from '../src/lib/jwt.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const URL_ = opt('url', 'ws://localhost:4100');
const WORKSPACE = opt('workspace', 'ws_test_latency');
const AGENT = opt('agent', 'agent_test_latency');
const USER = opt('user', 'user_test_latency');
const SAMPLES = opt('samples', null);
const TURNS = Number(opt('turns', 10));
const LABEL = opt('label', 'run');
const OUT = opt('out', null);
const GAP_MS = Number(opt('gap', 1200));
const ONLY = opt('only', null); // comma-separated sample basenames
const SAMPLE_RATE = 24000;
const FRAME_MS = 20;

if (!SAMPLES) { console.error('--samples <dir> is required'); process.exit(2); }

// ── WAV → PCM16 mono @24k, with the speech end located by frame energy ──────
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${file}: not a WAV`);
  let off = 12; let fmt = null; let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4); const len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len + (len % 2);
  }
  if (!fmt || !data) throw new Error(`${file}: malformed WAV`);
  if (fmt.channels !== 1 || fmt.rate !== SAMPLE_RATE || fmt.bits !== 16) throw new Error(`${file}: need mono 16-bit ${SAMPLE_RATE}Hz, got ${JSON.stringify(fmt)}`);
  return data;
}
const frameBytes = (SAMPLE_RATE * FRAME_MS / 1000) * 2;
function frames(pcm) {
  const out = [];
  for (let i = 0; i + frameBytes <= pcm.length; i += frameBytes) out.push(pcm.subarray(i, i + frameBytes));
  return out;
}
function rms(frame) {
  let s = 0; const n = frame.length / 2;
  for (let i = 0; i < frame.length; i += 2) { const v = frame.readInt16LE(i) / 32768; s += v * v; }
  return Math.sqrt(s / n);
}
/** Index of the last frame that carries speech (RMS above 2% of the peak). */
function lastSpeechFrame(fr) {
  const e = fr.map(rms); const peak = Math.max(...e); const th = peak * 0.02;
  for (let i = e.length - 1; i >= 0; i--) if (e[i] > th) return i;
  return e.length - 1;
}

const sampleFiles = fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.wav'))
  .filter((f) => !ONLY || ONLY.split(',').includes(path.basename(f, '.wav'))).sort();
if (!sampleFiles.length) { console.error('no .wav samples'); process.exit(2); }
const samples = sampleFiles.map((f) => {
  const pcm = readWav(path.join(SAMPLES, f)); const fr = frames(pcm);
  return { name: path.basename(f, '.wav'), frames: fr, lastSpeech: lastSpeechFrame(fr) };
});
const SILENCE = Buffer.alloc(frameBytes);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

const token = signAccessToken({ userId: USER, email: 'latency-harness@test.local', workspaceId: WORKSPACE, role: 'Owner' });
const ws = new WebSocket(`${URL_}/api/v1/workspaces/${WORKSPACE}/agents/${AGENT}/web-call`);
ws.binaryType = 'nodebuffer';

const rows = [];
let ready = null; let readyResolve;
const readyP = new Promise((r) => { readyResolve = r; });
let turn = null; // per-turn state
const history = [];

ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token, sampleRate: SAMPLE_RATE })));
ws.on('message', (data, isBinary) => {
  const t = now();
  if (isBinary) {
    if (!turn || !turn.segmentOpen) return;
    if (turn.firstAudioAt == null) turn.firstAudioAt = t;
    if (!turn.segmentFiller && turn.firstReplyAudioAt == null) turn.firstReplyAudioAt = t;
    turn.audioBytes += data.length;
    return;
  }
  let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
  if (msg.type === 'ready') { ready = msg; readyResolve(); return; }
  if (msg.type === 'error') { console.error('server error:', msg.code || '', msg.message); if (turn) turn.error = msg.message; return; }
  if (!turn) return;
  switch (msg.type) {
    case 'endpoint': if (turn.endpointAt == null) turn.endpointAt = t; break;
    case 'transcript': if (msg.role === 'user') turn.userText = msg.text; else if (msg.role === 'assistant') turn.replyText = (turn.replyText || '') + (turn.replyText ? ' ' : '') + msg.text; break;
    case 'audio-start': turn.segmentOpen = true; turn.segmentFiller = msg.filler === true; if (msg.turnId) turn.turnId = msg.turnId; if (turn.segmentFiller) turn.fillerPlayed = true; break;
    case 'audio-end': turn.segmentOpen = false; break;
    case 'done': turn.doneAt = t; if (msg.turnId) turn.turnId = msg.turnId; turn.serverTimings = msg.timings; if (msg.reply) turn.replyText = msg.reply; turn.doneResolve?.(); break;
    default: break;
  }
});
ws.on('close', (code, reason) => { if (!turn?.finished) { console.error(`socket closed ${code} ${reason}`); } });
ws.on('error', (e) => { console.error('socket error', e.message); process.exit(1); });

async function runTurn(i) {
  const sample = samples[i % samples.length];
  turn = { sample: sample.name, audioBytes: 0, segmentOpen: false, segmentFiller: false, fillerPlayed: false, firstAudioAt: null, firstReplyAudioAt: null, endpointAt: null, doneAt: null };
  const doneP = new Promise((r) => { turn.doneResolve = r; });
  ws.send(JSON.stringify({ type: 'start-turn', sampleRate: SAMPLE_RATE, history: history.slice() }));
  // A little lead-in silence, as a real mic has.
  const t0 = now(); let k = 0;
  const pace = async (frame) => { ws.send(frame); k += 1; const due = t0 + k * FRAME_MS; const d = due - now(); if (d > 0) await sleep(d); };
  for (let j = 0; j < 10; j++) await pace(SILENCE);
  for (let j = 0; j < sample.frames.length; j++) {
    // The browser stops capturing the moment the server says `endpoint`, so a
    // commit that lands before the utterance is over cuts the caller off. Do
    // the same here, and record it: that is the mid-sentence cut-off rate.
    if (turn.endpointAt != null && j <= sample.lastSpeech) { turn.prematureCommit = true; turn.speechEndAt = now(); turn.cutFrames = sample.lastSpeech - j; break; }
    await pace(sample.frames[j]);
    if (j === sample.lastSpeech) turn.speechEndAt = now();
  }
  // Keep the "mic" open with silence until the server ends the turn, exactly
  // as the browser keeps streaming until it hears `endpoint`. Backstop after
  // 3s with an explicit end-turn, like the client's RMS fallback would.
  const backstopAt = now() + 3000; let sentEndTurn = false;
  while (turn.endpointAt == null && turn.firstAudioAt == null && turn.doneAt == null) {
    if (!sentEndTurn && now() > backstopAt) { ws.send(JSON.stringify({ type: 'end-turn', history: history.slice() })); sentEndTurn = true; turn.backstop = true; }
    if (sentEndTurn && now() > backstopAt + 5000) break;
    await pace(SILENCE);
  }
  await Promise.race([doneP, sleep(30000)]);
  turn.finished = true;
  const se = turn.speechEndAt;
  const row = {
    kind: 'harness', label: LABEL, i, sample: sample.name, turnId: turn.turnId ?? null,
    speechEndToEndpointMs: turn.endpointAt != null ? Math.round(turn.endpointAt - se) : null,
    harnessSpeechEndToFirstAudioMs: turn.firstAudioAt != null ? Math.round(turn.firstAudioAt - se) : null,
    harnessSpeechEndToFirstReplyAudioMs: turn.firstReplyAudioAt != null ? Math.round(turn.firstReplyAudioAt - se) : null,
    speechEndToDoneMs: turn.doneAt != null ? Math.round(turn.doneAt - se) : null,
    fillerPlayed: turn.fillerPlayed, backstop: Boolean(turn.backstop), audioBytes: turn.audioBytes,
    prematureCommit: Boolean(turn.prematureCommit), cutFrames: turn.cutFrames ?? 0,
    userText: turn.userText ?? null, replyText: turn.replyText ?? null, serverTimings: turn.serverTimings ?? null, error: turn.error ?? null,
    ts: new Date().toISOString(),
  };
  rows.push(row);
  console.log(`#${i} ${sample.name.padEnd(14)} endpoint=${row.speechEndToEndpointMs ?? '-'} firstAudio=${row.harnessSpeechEndToFirstAudioMs ?? '-'} firstReply=${row.harnessSpeechEndToFirstReplyAudioMs ?? '-'} ${row.fillerPlayed ? '(ack)' : ''} ${row.backstop ? '(backstop)' : ''} ${row.prematureCommit ? `(CUT OFF ${row.cutFrames * FRAME_MS}ms early)` : ''} "${(row.userText || '').slice(0, 40)}" → "${(row.replyText || '').slice(0, 50)}"`);
  if (row.userText) history.push({ role: 'user', content: row.userText });
  if (row.replyText) history.push({ role: 'assistant', content: row.replyText });
  // Keep the prompt bounded the way a real conversation's window is.
  while (history.length > 8) history.shift();
}

(async () => {
  await Promise.race([readyP, sleep(40000).then(() => { throw new Error('no ready'); })]);
  console.log('ready', JSON.stringify(ready));
  for (let i = 0; i < TURNS; i++) { await runTurn(i); await sleep(GAP_MS); }
  ws.send(JSON.stringify({ type: 'stop' }));
  const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
  const stat = (k) => { const a = rows.map((r) => r[k]).filter((v) => typeof v === 'number'); return { n: a.length, p50: pct(a, .5), p90: pct(a, .9), p95: pct(a, .95), p99: pct(a, .99), max: a.length ? Math.max(...a) : null }; };
  const summary = { label: LABEL, turns: rows.length, failed: rows.filter((r) => r.harnessSpeechEndToFirstReplyAudioMs == null).length, cutOff: rows.filter((r) => r.prematureCommit).length, endpoint: stat('speechEndToEndpointMs'), firstAudioAny: stat('harnessSpeechEndToFirstAudioMs'), firstReplyAudio: stat('harnessSpeechEndToFirstReplyAudioMs'), done: stat('speechEndToDoneMs') };
  console.log(JSON.stringify(summary, null, 2));
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `harness_${LABEL}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(OUT, `harness_${LABEL}_summary.json`), JSON.stringify(summary, null, 2));
  }
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
