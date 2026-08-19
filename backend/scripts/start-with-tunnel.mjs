#!/usr/bin/env node
/**
 * Start the backend behind an ngrok tunnel, with PUBLIC_BACKEND_WS_URL wired up.
 *
 * Why this exists: a carrier opens a WebSocket *inward* to stream call audio, so
 * two-way phone calls need a publicly reachable wss:// origin. On the free ngrok
 * tier that URL changes every run, which means editing .env by hand before every
 * dev session and, when you forget, a call that silently degrades to a
 * greeting-only broadcast. This does it in one step.
 *
 *   node scripts/start-with-tunnel.mjs
 *
 * One-time setup (your ngrok account, not something this script can do for you):
 *
 *   ngrok config add-authtoken <your-token>      # from dashboard.ngrok.com
 *
 * NOTE: this deliberately starts the server the same way `npm start` does but
 * WITHOUT the prestart hook, because that hook runs `prisma migrate deploy`.
 * Starting a dev session must never be the thing that migrates a database.
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..');
const ENV_FILE = join(BACKEND, '.env');
const PORT = Number(process.env.PORT) || 4000;
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';

const log = (msg) => console.log(`[tunnel] ${msg}`);
const die = (msg) => { console.error(`[tunnel] ${msg}`); process.exit(1); };

/** ngrok on PATH, else the binary the npm package unpacks. */
function resolveNgrok() {
  const onPath = spawnSync('ngrok', ['version'], { shell: true, encoding: 'utf8' });
  if (onPath.status === 0) return { cmd: 'ngrok', shell: true };

  const npmBin = join(
    process.env.APPDATA || '', 'npm', 'node_modules', 'ngrok', 'bin',
    process.platform === 'win32' ? 'ngrok.exe' : 'ngrok',
  );
  if (existsSync(npmBin)) return { cmd: npmBin, shell: false };

  die('ngrok not found. Install it (https://ngrok.com/download) or `npm i -g ngrok`.');
  return null;
}

/** Poll ngrok's local API until the tunnel is published. */
async function waitForTunnel(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NGROK_API);
      if (res.ok) {
        const { tunnels = [] } = await res.json();
        const https = tunnels.find((t) => t.public_url?.startsWith('https://'));
        if (https) return https.public_url;
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/**
 * Set PUBLIC_BACKEND_WS_URL in .env, replacing any existing (or commented-out)
 * definition. Everything else in the file is preserved byte for byte — this
 * runs against a file holding live provider credentials.
 */
function writeEnvVar(url) {
  if (!existsSync(ENV_FILE)) die(`.env not found at ${ENV_FILE}`);
  const original = readFileSync(ENV_FILE, 'utf8');
  const line = `PUBLIC_BACKEND_WS_URL=${url}`;
  const re = /^#?\s*PUBLIC_BACKEND_WS_URL=.*$/m;

  const next = re.test(original)
    ? original.replace(re, line)
    : `${original.replace(/\s*$/, '')}\n\n# Set automatically by scripts/start-with-tunnel.mjs\n${line}\n`;

  if (next !== original) writeFileSync(ENV_FILE, next, 'utf8');
  return line;
}

/**
 * The domain to ask ngrok for, so the public URL SURVIVES A RESTART.
 *
 * This is not a nicety, it is the difference between testing phone calls
 * locally and having to deploy for every attempt. An OUTBOUND call only needs
 * whatever URL is current, because we hand the carrier the address at dial
 * time. An INBOUND call does not: the number's answer URL is configured in the
 * carrier's own dashboard, so a URL that changes every dev session means
 * re-editing the Plivo/Twilio console before every test, and a number left
 * pointing at last session's dead tunnel answers with ngrok's ERR_NGROK_3200
 * page instead of call XML.
 *
 * Free ngrok accounts include one static domain, which is exactly what this
 * needs. Preference order:
 *   1. NGROK_DOMAIN, if set explicitly;
 *   2. the ngrok host already in PUBLIC_BACKEND_WS_URL — if a previous session
 *      published it and the account owns it, asking for it again is free and
 *      keeps every carrier dashboard entry valid;
 *   3. nothing, i.e. a random URL, which still works for outbound-only testing.
 *
 * Asking for a domain the account does not own is a hard ngrok error, so a
 * rejection falls back to (3) with a warning rather than failing the session.
 */
function preferredDomain() {
  if (process.env.NGROK_DOMAIN) return process.env.NGROK_DOMAIN.trim();
  const existing = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, 'utf8').match(/^\s*PUBLIC_BACKEND_WS_URL=(.+)$/m)?.[1]?.trim()
    : '';
  if (!existing) return '';
  try {
    const host = new URL(existing.replace(/^ws(s)?:\/\//i, (_m, s) => (s ? 'https://' : 'http://'))).host;
    return /\.ngrok(-free)?\.(dev|app|io)$/i.test(host) ? host : '';
  } catch { return ''; }
}

const ngrok = resolveNgrok();

/**
 * Spawn ngrok, optionally pinned to `domain`. Returns the published URL or null.
 * `timeoutMs` is short for a pinned attempt: a domain the account cannot serve
 * is refused immediately, so waiting the full window for it only delays the
 * fallback that was always going to run.
 */
async function openTunnel(domain, timeoutMs) {
  const args = ['http', String(PORT), '--log=stdout'];
  if (domain) args.push('--domain', domain);
  const child = spawn(ngrok.cmd, args, { shell: ngrok.shell, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });
  const url = await waitForTunnel(timeoutMs);
  return { child, url, output: () => output };
}

const domain = preferredDomain();
log(`starting ngrok on port ${PORT}${domain ? ` (asking for ${domain})` : ''}...`);
let { child: tunnel, url: publicUrl, output } = await openTunnel(domain, domain ? 12_000 : 25_000);

// A domain the account does not own, or one already claimed by another agent,
// is fatal to THAT attempt only — a random URL still gets outbound testing
// working, and saying so beats dying with an ngrok error code.
if (!publicUrl && domain) {
  tunnel.kill();
  // Let the dead agent release port 4040 before the next one polls it, or
  // waitForTunnel can read the corpse's (empty) tunnel list as the new one's.
  await new Promise((r) => setTimeout(r, 1500));
  log(`ngrok would not serve ${domain} — retrying with a random URL.`);
  log('   inbound calls will need the carrier dashboard updated to the new address.');
  ({ child: tunnel, url: publicUrl, output } = await openTunnel('', 25_000));
}

if (!publicUrl) {
  tunnel.kill();
  const ngrokOutput = output();
  if (/ERR_NGROK_4018|authtoken/i.test(ngrokOutput)) {
    die('ngrok needs an authtoken. Run:  ngrok config add-authtoken <your-token>\n'
      + '        Get one free at https://dashboard.ngrok.com/get-started/your-authtoken');
  }
  die(`ngrok did not publish a tunnel.\n${ngrokOutput.slice(-600)}`);
}

const wsUrl = publicUrl.replace(/^https:\/\//, 'wss://');
const previous = existsSync(ENV_FILE)
  ? readFileSync(ENV_FILE, 'utf8').match(/^\s*PUBLIC_BACKEND_WS_URL=(.+)$/m)?.[1]?.trim()
  : '';
writeEnvVar(wsUrl);

log(`tunnel:  ${publicUrl}`);
log(`env:     PUBLIC_BACKEND_WS_URL=${wsUrl}`);
// Said loudly, because nothing downstream can detect it: an inbound number
// still points at the old address, and the failure it produces (ngrok's
// ERR_NGROK_3200 page returned where call XML was expected) looks like a bug in
// this codebase rather than a stale dashboard entry.
if (previous && previous !== wsUrl) {
  log('');
  log(`WARNING: the public address CHANGED (was ${previous}).`);
  log('   Outbound calls are fine — the carrier is handed this address at dial time.');
  log('   INBOUND calls will keep hitting the old one until you update the answer URL');
  log('   in the carrier dashboard. Set NGROK_DOMAIN to a reserved domain to stop this.');
  log('');
}
log('inspect: http://127.0.0.1:4040');
log('starting backend (no migrate hook)...\n');

const server = spawn(
  process.execPath,
  ['--env-file=.env', 'src/server.js'],
  { cwd: BACKEND, stdio: 'inherit' },
);

// Tear the tunnel down with the server. A tunnel outliving the process it was
// opened for is a public door to a port that may now be something else.
const shutdown = () => {
  try { server.kill(); } catch { /* already gone */ }
  try { tunnel.kill(); } catch { /* already gone */ }
};
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });
server.on('exit', (code) => { try { tunnel.kill(); } catch { /* ignore */ } process.exit(code ?? 0); });
