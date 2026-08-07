// PM2 process definition — Hostinger VPS (62.72.12.185, shared with 4 other apps).
//
// .cjs, not .js: backend/package.json declares "type": "module", and PM2 loads
// this file with require(). A .js extension here is parsed as ESM and throws.
//
// Apply with:  pm2 startOrReload ecosystem.config.cjs --only convai-voice-api
// The --only flag matters on this box: 17 other PM2 processes are registered
// (blog-backend, mannmate-*, herbs-client, ...) and a bare `pm2 reload` would
// restart all of them.

const fs = require('fs');

const APP_ROOT = '/root/apps/convai-voice';
const NVM_VERSIONS = '/root/.nvm/versions/node';

// Resolve the newest installed Node that this backend can actually run on.
//
// Hardcoding a path here cost a deploy: the box's default was v20.10.0, and
// pdf-parse → pdfjs-dist calls process.getBuiltinModule() at import time. That
// API landed in 20.16, so on 20.10 the polyfill silently failed and the server
// died at boot with "ReferenceError: DOMMatrix is not defined" — nowhere near
// the actual cause. backend/package.json only says ">=20.0.0", but pdf-parse's
// own engines field is the binding constraint: ">=20.16.0 <21 || >=22.3.0".
// 21.x is excluded deliberately, not by oversight.
//
// Resolved dynamically so an nvm upgrade on this shared box does not silently
// strand this app on a version it cannot boot under.
const satisfies = ([maj, min]) =>
  (maj === 20 && min >= 16) || (maj === 22 && min >= 3) || maj > 22;

const resolveNodeBin = () => {
  let best = null;
  // Guarded: without this, a missing nvm directory surfaces as a raw ENOENT
  // stack trace from readdirSync instead of the actionable message below.
  const installed = fs.existsSync(NVM_VERSIONS) ? fs.readdirSync(NVM_VERSIONS) : [];
  for (const dir of installed) {
    const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(dir);
    if (!m) continue;
    const version = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!satisfies(version)) continue;
    const bin = `${NVM_VERSIONS}/${dir}/bin/node`;
    if (!fs.existsSync(bin)) continue;
    const rank = version[0] * 1e6 + version[1] * 1e3 + version[2];
    if (!best || rank > best.rank) best = { rank, bin };
  }
  if (!best) {
    throw new Error(
      `No suitable Node found under ${NVM_VERSIONS}. This backend needs ` +
      '>=20.16 <21 or >=22.3 (pdf-parse/pdfjs-dist). Install one with:  nvm install 20.19.4'
    );
  }
  return best.bin;
};

module.exports = {
  apps: [
    {
      // Unique across the existing PM2 list. Do not shorten to "server" or
      // "client" — both names are already taken by Herbs_Magic_NextJS.
      name: 'convai-voice-api',

      cwd: `${APP_ROOT}/repo/backend`,
      script: 'src/server.js',

      // Absolute path, deliberately not "node". PM2 is launched by the
      // pm2-root systemd unit, which has no login shell and therefore no nvm
      // in PATH — it would resolve /usr/bin/node instead, which is older still.
      // See resolveNodeBin() above for why the version matters.
      interpreter: resolveNodeBin(),

      // Mirrors backend/package.json's `start` script. Node aborts if the file
      // is missing, which is the behaviour we want: better a hard boot failure
      // than a process that silently starts with no DATABASE_URL.
      // The file is a symlink to ${APP_ROOT}/shared/.env so it survives
      // `git reset --hard` on every deploy.
      node_args: ['--env-file=.env'],

      // fork, NOT cluster, and exactly one instance. Three things in this
      // process are not safe to run twice:
      //   - the BullMQ campaign worker (server.js:54)
      //   - the subscription renewal sweep (server.js:148)
      //   - the in-memory WebSocket session maps for live voice calls
      // Cluster mode would also break sticky WS routing across workers.
      exec_mode: 'fork',
      instances: 1,

      // PORT and every other variable come from the .env file above. Setting
      // PORT here as well would create two sources of truth for the one value
      // nginx's proxy_pass is hardcoded against.
      env: {
        NODE_ENV: 'production',
      },

      autorestart: true,
      // A boot failure (bad DATABASE_URL, port already bound) should surface
      // fast rather than loop forever. Three of the pre-existing apps on this
      // box are stuck in restart loops with 800+ restarts each, burning CPU on
      // a 2-core VM — these two settings are what stop this app joining them.
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 4000,

      // Restarting severs every in-flight voice call, so this is a last-resort
      // guard against a leak, not a routine control. Steady state is ~250-400MB;
      // 1.2GB means something is genuinely wrong.
      max_memory_restart: '1200M',

      // server.js traps SIGTERM and force-exits after SHUTDOWN_GRACE_PERIOD_MS
      // (10s, constants/limits.js:20). PM2 must wait longer than that or it
      // SIGKILLs mid-shutdown and Prisma never disconnects cleanly.
      kill_timeout: 12000,
      listen_timeout: 10000,

      // Logs live outside the repo so `git reset --hard` and rsync never touch
      // them. Rotation is handled by pm2-logrotate (installed by bootstrap.sh).
      out_file: `${APP_ROOT}/logs/api-out.log`,
      error_file: `${APP_ROOT}/logs/api-error.log`,
      merge_logs: true,
      time: true,

      // Never enable watch on this box: the uploads directory is written at
      // runtime (KB files, cloned voices, call recordings) and would trigger a
      // restart on every upload, killing active calls.
      watch: false,
    },
  ],
};
