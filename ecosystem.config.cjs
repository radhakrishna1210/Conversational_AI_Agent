// PM2 process definition — Hostinger VPS (62.72.12.185, shared with 4 other apps).
//
// .cjs, not .js: backend/package.json declares "type": "module", and PM2 loads
// this file with require(). A .js extension here is parsed as ESM and throws.
//
// Apply with:  pm2 startOrReload ecosystem.config.cjs --only convai-voice-api
// The --only flag matters on this box: 17 other PM2 processes are registered
// (blog-backend, mannmate-*, herbs-client, ...) and a bare `pm2 reload` would
// restart all of them.

const APP_ROOT = '/root/apps/convai-voice';

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
      // in PATH — it would resolve /usr/bin/node instead. This backend needs
      // Node >= 20.6 for the --env-file flag below; the system node is a
      // different version and would fail with "bad option".
      interpreter: '/root/.nvm/versions/node/v20.10.0/bin/node',

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
