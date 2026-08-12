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

const ngrok = resolveNgrok();

log(`starting ngrok on port ${PORT}...`);
const tunnel = spawn(ngrok.cmd, ['http', String(PORT), '--log=stdout'], {
  shell: ngrok.shell,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ngrokOutput = '';
tunnel.stdout.on('data', (d) => { ngrokOutput += d.toString(); });
tunnel.stderr.on('data', (d) => { ngrokOutput += d.toString(); });

const publicUrl = await waitForTunnel();

if (!publicUrl) {
  tunnel.kill();
  if (/ERR_NGROK_4018|authtoken/i.test(ngrokOutput)) {
    die('ngrok needs an authtoken. Run:  ngrok config add-authtoken <your-token>\n'
      + '        Get one free at https://dashboard.ngrok.com/get-started/your-authtoken');
  }
  die(`ngrok did not publish a tunnel.\n${ngrokOutput.slice(-600)}`);
}

const wsUrl = publicUrl.replace(/^https:\/\//, 'wss://');
writeEnvVar(wsUrl);

log(`tunnel:  ${publicUrl}`);
log(`env:     PUBLIC_BACKEND_WS_URL=${wsUrl}`);
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
