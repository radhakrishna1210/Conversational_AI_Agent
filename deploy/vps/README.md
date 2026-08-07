# VPS Deployment — voice.herbsmagic.in

Deployment of this project onto the **shared** Hostinger VPS at `62.72.12.185`,
alongside four existing production apps.

## The constraints this deployment was built around

An audit of the box on 2026-08-07 turned up several things that shape every
decision below.

| Finding | Consequence |
|---|---|
| **Port 4000 is owned by `blog-backend`** and proxied by `blogs.mannmate.com` | This project's default port would have collided on first boot. Pinned to **4300**. |
| Ports 3000, 3001, 3100, 3200, 5000, 5100, 6379, 8000, 8001, 9100, 27017 also bound | 4300 is the free slot; changing it means changing three files together. |
| **Redis is shared and password-protected** (`requirepass` set) | BullMQ uses **db index 3** to stay clear of the other project's keys. |
| Redis `maxmemory-policy` is **global** | BullMQ needs `noeviction`; flipping it affects the other consumer. Must be checked, not assumed. |
| **2 vCPUs, ~4.3 GB free, 17 PM2 processes** | The React build runs in GitHub Actions. An OOM on-box would kill a *neighbour's* app. |
| Node is **v20.10.0 via nvm**, but `/usr/bin/node` is older | PM2 runs from a systemd unit with no nvm in PATH — the interpreter path is pinned absolutely. |
| Only 2 of 5 nginx sites handle `Upgrade` | Voice calls need a WebSocket block with a long `proxy_read_timeout`. |
| `map $connection_upgrade` may already exist at http scope | Our config avoids `map` entirely — a duplicate would break **all five** existing sites. |

## Layout on the server

Everything mutable lives outside the git working tree, because `deploy.sh` runs
`git reset --hard` on every deploy.

```
/root/apps/convai-voice/
├── repo/                     git checkout — disposable, reset every deploy
│   └── backend/.env       →  symlink to ../../shared/.env
├── shared/
│   ├── .env                  real env file (chmod 600)
│   └── uploads/              UPLOAD_DIR — KB files, cloned voices, recordings
├── logs/                     pm2 stdout/stderr, rotated at 20MB × 14
└── .deploy-incoming/dist/    staging area for the CI-built client
```

## First-time setup

**Prerequisite:** a DNS **A record** for `voice.herbsmagic.in` → `62.72.12.185`,
propagated. Certbot's HTTP-01 challenge fails without it.

```bash
ssh root@62.72.12.185
mkdir -p /root/apps/convai-voice
git clone https://github.com/radhakrishna1210/Conversational_AI_Agent.git /root/apps/convai-voice/repo
bash /root/apps/convai-voice/repo/deploy/vps/bootstrap.sh
```

`bootstrap.sh` is idempotent and touches nothing belonging to the other apps.
It creates the layout, installs `pm2-logrotate`, enables the nginx site (running
`nginx -t` before any reload), and **reports** the Redis and firewall situation
rather than changing shared settings behind your back.

Then, in order:

1. **Fill in the env file** — `vim /root/apps/convai-voice/shared/.env`
   (template: `backend/.env.vps.example`).
   > `ENCRYPTION_KEY` must be copied **verbatim** from your local
   > `backend/.env`. It decrypts OAuth tokens already stored in the live
   > Supabase database; a fresh value makes every saved credential permanently
   > unreadable, with no recovery path.

2. **Issue the certificate** — `certbot --nginx -d voice.herbsmagic.in`

3. **Redis policy** — bootstrap prints the current `maxmemory-policy`. If it
   isn't `noeviction`, check what the other project has in there first
   (`redis-cli -a <pass> INFO keyspace`), then:
   ```bash
   redis-cli -a <pass> CONFIG SET maxmemory-policy noeviction
   # and persist it in /etc/redis/redis.conf so it survives a restart
   ```

4. **First deploy** — `/root/apps/convai-voice/repo/deploy/vps/deploy.sh`

5. **Point the webhooks** at the new host:
   - Twilio voice webhook + status callback → `https://voice.herbsmagic.in/api/v1/...`
   - Razorpay → `https://voice.herbsmagic.in/api/v1/billing/razorpay/webhook`
   - Google OAuth redirect URIs → re-register in Google Cloud Console

## Continuous deployment

Push to `main` → GitHub Actions builds the client, rsyncs it, and runs
`deploy.sh` over SSH.

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | `62.72.12.185` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | private key whose public half is in `/root/.ssh/authorized_keys` |
| `VPS_PORT` | `22` (optional) |

Generate the keypair:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/convai_deploy -N "" -C "github-actions-convai"
ssh-copy-id -i ~/.ssh/convai_deploy.pub root@62.72.12.185
cat ~/.ssh/convai_deploy          # → paste into the VPS_SSH_KEY secret
```

### What a deploy does

1. `git fetch` + `reset --hard origin/main` — never `pull` (an unresolvable
   merge conflict on a server checkout needs a human) and never `clean -fdx`
   (it would delete `client/dist`, `node_modules` and the `.env` symlink).
2. `npm ci` in `backend/` — the **full** install, not `--omit=dev`: `prisma`
   is a devDependency and both `generate` and `migrate deploy` need the CLI.
3. `prisma generate` — every time. A stale client against a migrated schema is
   what produces "column does not exist" at runtime.
4. `prisma migrate deploy` through `DIRECT_URL` (port 5432). PgBouncer in
   transaction mode cannot execute DDL, so migrating via the 6543 pooler fails.
5. Atomic `mv` of the CI-built `dist` into place.
6. `pm2 startOrReload ecosystem.config.cjs --only convai-voice-api`.
   > `--only` is load-bearing. 17 PM2 processes from four other projects are
   > registered here; a bare `pm2 reload` restarts all of them.
7. Health check against `127.0.0.1:4300/health`, 30s budget, then a public
   `https://voice.herbsmagic.in/health` check from CI.

A failed health check prints the last 40 log lines and exact rollback commands,
and fails the workflow.

## Operations

```bash
pm2 logs convai-voice-api --lines 100     # tail
pm2 restart convai-voice-api --update-env # after an .env change
pm2 describe convai-voice-api             # port, uptime, restarts, memory
curl -s localhost:4300/health             # bypass nginx
nginx -t                                  # ALWAYS before reloading
```

### Rollback

```bash
cd /root/apps/convai-voice/repo
git reset --hard <previous-sha>
cd backend && npm ci --no-audit --no-fund && npx prisma generate
cd .. && pm2 restart convai-voice-api --update-env
```

Note this does **not** roll back database migrations — Prisma has no automatic
down-migration. A schema change that must be reverted needs a new forward
migration.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every page returns JSON `{"error":"Not found"}` | `client/dist` is missing. `app.js:113` logs `No client build at ...`. The CI rsync step failed. |
| Calls disconnect at exactly 60 seconds | nginx `proxy_read_timeout` reverted to its default on the WebSocket blocks. |
| Phone calls answer with a greeting then go silent | `PUBLIC_BACKEND_WS_URL` is wrong or unset — the bundled engine degrades to greeting-only *silently*. |
| Every API call from the page is CORS-rejected | `CLIENT_URL` mismatch. Production excludes the localhost fallbacks (`app.js:18`). |
| Boot fails, `bad option: --env-file` | PM2 resolved `/usr/bin/node` instead of the nvm build. Check `interpreter` in `ecosystem.config.cjs`. |
| `bash\r: bad interpreter` | CRLF line endings. `.gitattributes` forces LF — confirm it was committed. |
| Campaigns run but lose jobs on restart | `REDIS_URL` unset/wrong, or `maxmemory-policy` is not `noeviction`. |
| Wallet top-ups rejected | `RAZORPAY_WEBHOOK_SECRET` unset. The webhook fails **closed** by design. |

## Known issues on this box (pre-existing, not introduced here)

Found during the audit. Neither blocks this deployment.

1. **Three apps are in restart loops** — `client` (id 1: 672 restarts), `client`
   (id 11: 875+), `webinar_client` (359+), plus `flask_hair_new` (202+). Two
   showed `0s` uptime *during* the audit. On a 2-core VM this is continuous
   wasted CPU that this app now competes with. Ids 5, 6, 8, 9, 10 are stale
   `stopped` duplicates of `herbs-client` cluttering the process list.

2. **MongoDB is publicly exposed** — `mongod` binds `0.0.0.0:27017` and ufw has
   both `27017 ALLOW Anywhere` and `27017/tcp ALLOW Anywhere`. That is an
   internet-reachable database on the second-most-scanned port. Also open with
   no listener behind them: `5173`, `5174` (Vite dev servers), `9090`, `3000`,
   `5000`.

   Suggested fix (verify nothing connects remotely first):
   ```bash
   ufw delete allow 27017 && ufw delete allow 27017/tcp
   ufw delete allow 5173  && ufw delete allow 5174
   # then in /etc/mongod.conf:  net.bindIp: 127.0.0.1
   systemctl restart mongod
   ```

3. **Ubuntu 20.04 reached end of standard support on 31 May 2025.** 195 security
   updates are available only via ESM. Worth planning a 22.04 upgrade.
