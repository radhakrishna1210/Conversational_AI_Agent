/**
 * Why did a broadcast call answer, play nothing, and hang up?
 *
 * That symptom has exactly one shape behind it: the carrier picked up, asked us
 * for the audio, and did not get back something it could play. `<Play>` is the
 * whole call document — when it fails there is no next element, so the line
 * drops after a second or two of silence. This walks the same chain the carrier
 * walks and reports where it breaks:
 *
 *   1. is there a public address to fetch from at all
 *   2. does the recording row point at a file that exists
 *   3. is that file a container/codec a phone line can actually decode
 *   4. does the signed URL answer over the public internet, as the carrier calls it
 *   5. what did the carrier tell us about the calls afterwards
 *
 * Read-only. Run it on the machine that serves the audio — the file check is
 * meaningless anywhere else.
 *
 *   node --env-file=.env scripts/diagnose-broadcast.js
 *   node --env-file=.env scripts/diagnose-broadcast.js <broadcastId|recordingId>
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/config/prisma.js';
import { publicHttpBase } from '../src/lib/publicUrl.js';
import {
  RECORDINGS_DIR, publicAudioUrl, recordingFilePath,
} from '../src/services/broadcast/broadcastRecording.service.js';

const arg = process.argv[2] || null;

const ok = (s) => `  OK    ${s}`;
const warn = (s) => `  WARN  ${s}`;
const head = (s) => `\n${s}\n${'-'.repeat(s.length)}`;

let failures = 0;
const fail = (s) => { failures += 1; console.log(`  FAIL  ${s}`); };

/**
 * What this file actually is, read from its own bytes.
 *
 * The stored mimeType is what the uploader claimed; this is what the carrier
 * will find. They diverge exactly when a broadcast plays silence — a WebM blob
 * or a float-PCM WAV is a perfectly good file that no phone line can decode.
 */
function describeAudio(buf) {
  if (buf.length < 12) return { kind: 'empty', playable: false, detail: `${buf.length} bytes` };

  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    // Walk to `fmt ` rather than assuming byte 12 — a LIST chunk can precede it.
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (id === 'fmt ' && offset + 8 + 16 <= buf.length) {
        const body = offset + 8;
        const tag = buf.readUInt16LE(body);
        const channels = buf.readUInt16LE(body + 2);
        const rate = buf.readUInt32LE(body + 4);
        const bits = buf.readUInt16LE(body + 14);
        const TAGS = {
          1: 'PCM', 3: 'IEEE float', 6: 'A-law', 7: 'mu-law', 0xfffe: 'WAVE_FORMAT_EXTENSIBLE',
        };
        const name = TAGS[tag] ?? `codec 0x${tag.toString(16)}`;
        return {
          // Both carriers document PCM WAV. Anything else here is a file that
          // opens fine on a laptop and plays as silence down a phone line.
          kind: `WAV / ${name}`,
          playable: tag === 1,
          detail: `${channels}ch ${rate}Hz ${bits}-bit`,
        };
      }
      offset += 8 + size + (size % 2);
    }
    return { kind: 'WAV (no fmt chunk)', playable: false, detail: 'header is truncated or malformed' };
  }

  if (buf.toString('ascii', 0, 3) === 'ID3') return { kind: 'MP3 (ID3-tagged)', playable: true, detail: '' };
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return { kind: 'MP3', playable: true, detail: '' };
  if (buf.toString('ascii', 0, 4) === 'OggS') return { kind: 'Ogg (Opus/Vorbis)', playable: false, detail: 'no carrier plays Ogg' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') return { kind: 'MP4/M4A (AAC)', playable: false, detail: 'no carrier plays MP4' };
  if (buf.toString('ascii', 0, 4) === 'fLaC') return { kind: 'FLAC', playable: false, detail: 'no carrier plays FLAC' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return {
      kind: 'WebM/Matroska',
      playable: false,
      detail: 'a raw MediaRecorder blob — the browser conversion did not run',
    };
  }
  return { kind: 'unrecognised', playable: false, detail: `starts ${buf.subarray(0, 8).toString('hex')}` };
}

// -- 1. Somewhere for the carrier to fetch from ------------------------------
console.log(head('1. Public address'));
const base = publicHttpBase();
if (!base) {
  fail('publicHttpBase() is empty - PUBLIC_BACKEND_WS_URL / PUBLIC_BACKEND_URL are unset.');
  console.log('        Every broadcast call would connect and play silence. Nothing below can pass.');
} else {
  console.log(ok(`carrier fetches from ${base}`));
}
console.log(`        recordings dir: ${RECORDINGS_DIR}`);
console.log(`        audio URLs signed with: ${process.env.BROADCAST_AUDIO_SECRET ? 'BROADCAST_AUDIO_SECRET' : 'JWT_ACCESS_SECRET (fallback)'}`);

// -- 2. Which broadcast are we looking at -----------------------------------
const broadcast = await prisma.broadcast.findFirst({
  where: arg ? { OR: [{ id: arg }, { recordingId: arg }] } : {},
  orderBy: { createdAt: 'desc' },
  include: { recording: true },
});

let recording = broadcast?.recording ?? null;
if (!recording && arg) recording = await prisma.broadcastRecording.findUnique({ where: { id: arg } });
if (!recording) recording = await prisma.broadcastRecording.findFirst({ orderBy: { createdAt: 'desc' } });

if (!recording) {
  console.log(head('2. Recording'));
  fail('No BroadcastRecording rows exist at all - nothing has ever been recorded here.');
  await prisma.$disconnect();
  process.exit(1);
}

if (broadcast) {
  console.log(head('2. Broadcast'));
  console.log(`        ${broadcast.name}  [${broadcast.status}]  ${broadcast.id}`);
  console.log(`        launched ${broadcast.launchedAt?.toISOString() ?? '-'}  ·  ${broadcast.totalRecipients} recipients  ·  repeat ${broadcast.repeatCount}`);
  const callers = Array.isArray(broadcast.fromNumbers) && broadcast.fromNumbers.length
    ? broadcast.fromNumbers
    : [broadcast.fromNumber].filter(Boolean);
  console.log(`        caller IDs: ${callers.join(', ') || '-'}`);
  if (broadcast.lastError) console.log(warn(`lastError: ${broadcast.lastError}`));
}

// -- 3. The bytes -----------------------------------------------------------
console.log(head('3. Recording and its file'));
console.log(`        ${recording.name}  [${recording.source}/${recording.status}]  ${recording.id}`);
console.log(`        claims ${recording.mimeType}, ${recording.durationSec}s, ${recording.sizeBytes} bytes`);

const filePath = recordingFilePath(recording);
let buf = null;
if (!fs.existsSync(filePath)) {
  fail(`the file is NOT on disk: ${filePath}`);
  console.log('        The row survived a deploy the file did not. The audio endpoint answers 410,');
  console.log('        the carrier plays nothing, and the call drops - exactly the reported symptom.');
  console.log(`        Check UPLOAD_DIR (currently ${process.env.UPLOAD_DIR || 'unset -> ./uploads'}) points`);
  console.log('        at shared storage, not inside a release directory.');
} else {
  buf = fs.readFileSync(filePath);
  console.log(ok(`file present: ${path.basename(filePath)} (${buf.length} bytes)`));
  if (buf.length !== recording.sizeBytes) console.log(warn(`on-disk size ${buf.length} != recorded ${recording.sizeBytes}`));
  if (buf.length === 0) fail('the file is empty (0 bytes)');

  const audio = describeAudio(buf);
  const line = `bytes are ${audio.kind}${audio.detail ? ` (${audio.detail})` : ''}`;
  if (audio.playable) {
    console.log(ok(line));
  } else {
    fail(line);
    console.log('        A phone line plays MP3 or PCM WAV and nothing else. The carrier fetched this,');
    console.log('        could not decode it, and hung up - silence, then a drop after a second or two.');
    console.log('        Re-upload the message as MP3 or 16-bit PCM WAV.');
  }
}

// -- 4. The fetch the carrier actually makes --------------------------------
console.log(head('4. The carrier-facing URL'));
if (!base) {
  console.log(warn('skipped - no public address to build a URL from'));
} else {
  let url = null;
  try {
    url = publicAudioUrl(recording.id);
  } catch (err) {
    fail(`the URL could not even be built: ${err.message}`);
  }
  if (url) {
    console.log(`        GET ${url}`);
    try {
      const started = Date.now();
      const res = await fetch(url, { redirect: 'manual' });
      const bytes = Buffer.from(await res.arrayBuffer());
      const ms = Date.now() - started;
      const type = res.headers.get('content-type') ?? '-';

      if (res.status === 200) {
        console.log(ok(`${res.status} · ${type} · ${bytes.length} bytes · ${ms}ms`));
        // A 200 that hands back the SPA's index.html instead of audio is the
        // failure that looks like success in every log we keep.
        if (!/^audio\//i.test(type)) {
          fail(`content-type is ${type}, not audio/* - the carrier will not play this`);
        }
        if (buf && bytes.length !== buf.length) {
          fail(`served ${bytes.length} bytes but the file on disk is ${buf.length} - something is rewriting the body`);
        }
      } else if (res.status >= 300 && res.status < 400) {
        fail(`${res.status} redirect to ${res.headers.get('location')} - carriers do not always follow these`);
      } else {
        fail(`${res.status} · ${bytes.toString('utf8').slice(0, 200)}`);
        if (res.status === 403) console.log('        Token mismatch: the process that signs the URL and the one that serves it disagree on the secret.');
        if (res.status === 410) console.log('        The row is there, the file is not. See section 3.');
      }
    } catch (err) {
      fail(`the fetch failed outright: ${err.message}`);
      console.log('        If the carrier cannot reach this address, neither can the call. Check DNS,');
      console.log('        TLS, and that the host is reachable from outside this machine.');
    }
  }
}

// -- 5. What the carrier said afterwards ------------------------------------
if (broadcast) {
  console.log(head('5. What the carrier reported'));
  const rows = await prisma.broadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId: broadcast.id },
    _count: { _all: true },
    _sum: { durationSec: true },
  });
  if (!rows.length) console.log(warn('no recipient rows - this broadcast never dialled'));
  for (const r of rows) {
    console.log(`        ${String(r._count._all).padStart(5)}  ${r.status.padEnd(10)} ${r._sum.durationSec ?? 0}s total`);
  }

  const answered = rows.find((r) => r.status === 'answered');
  if (answered?._count._all) {
    const secs = answered._sum.durationSec ?? 0;
    const avg = secs / answered._count._all;
    const expected = recording.durationSec * (broadcast.repeatCount || 1);
    console.log(`        average answered call: ${avg.toFixed(1)}s (message is ${expected}s)`);
    // The signature of this bug: the calls connect and bill, but for a fraction
    // of the message. Nobody heard anything.
    if (avg > 0 && avg < expected * 0.5) {
      fail(`answered calls end at ~${avg.toFixed(1)}s, well short of the ${expected}s message`);
      console.log('        The audio never played. Sections 3 and 4 above say why.');
    }
  }

  const reasons = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id, failureReason: { not: null } },
    select: {
      failureReason: true, phoneNumber: true, provider: true, durationSec: true,
    },
    take: 5,
  });
  for (const r of reasons) {
    console.log(`        ${r.provider ?? '?'} ${r.phoneNumber}: ${r.failureReason} (${r.durationSec}s)`);
  }
}

console.log(head(failures ? `${failures} problem${failures === 1 ? '' : 's'} found` : 'Everything on the audio path checks out'));
if (!failures) {
  console.log('The file is playable and the carrier-facing URL serves it. If calls are still silent,');
  console.log('the failure is upstream of the audio: check the carrier\'s own call log for the');
  console.log('answer-URL response, and grep the app log for "signature did not validate" and');
  console.log('"Plivo answered a one-way broadcast call".');
}

await prisma.$disconnect();
process.exit(failures ? 1 : 0);
