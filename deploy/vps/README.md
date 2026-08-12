# VPS Deployment — spandan.mannmate.com

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
| **2 vCPUs, ~4.3 GB free, 17 PM2 processes** | The client build is capped at a 1536MB heap and gated on free memory — an OOM here could kill a *neighbour's* app, not just the build. |
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
└── logs/                     pm2 stdout/stderr, rotated at 20MB × 14
```

## First-time setup

**Prerequisite:** a DNS **A record** for `spandan.mannmate.com` → `62.72.12.185`,
propagated. Certbot's HTTP-01 challenge fails without it.

```bash
ssh root@62.72.12.185
mkdir -p /root/apps/convai-voice
git clone https://github.com/HerbsMagic/HM-Voice-agent.git /root/apps/convai-voice/repo
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

2. **Issue the certificate** — `certbot --nginx -d spandan.mannmate.com`

3. **Redis policy** — bootstrap prints the current `maxmemory-policy`. If it
   isn't `noeviction`, check what the other project has in there first
   (`redis-cli -a <pass> INFO keyspace`), then:
   ```bash
   redis-cli -a <pass> CONFIG SET maxmemory-policy noeviction
   # and persist it in /etc/redis/redis.conf so it survives a restart
   ```

4. **First deploy** — `/root/apps/convai-voice/repo/deploy/vps/deploy.sh`

5. **Point the webhooks** at the new host:
   - Twilio voice webhook + status callback → `https://spandan.mannmate.com/api/v1/...`
   - Razorpay → `https://spandan.mannmate.com/api/v1/billing/razorpay/webhook`
   - Google OAuth redirect URIs → re-register in Google Cloud Console

## Cutover from voice.herbsmagic.in

This app was first deployed at `voice.herbsmagic.in` on this same box, port
4300. The move to `spandan.mannmate.com` is a **rename in place**: same VPS,
same port, same PM2 process, same Supabase database, same `shared/uploads`.
Nothing is copied and nothing is reinstalled — only the hostname in front of it
changes.

**Order matters.** Every external service still calling the old host keeps
working right up until the old nginx site is removed, and breaks the instant it
is. So the old site comes down *last*, after the new one is proven and every
provider has been re-pointed.

```bash
# 1. DNS — A record  spandan.mannmate.com → 62.72.12.185
#    Leave the voice.herbsmagic.in record in place for now.
dig +short spandan.mannmate.com     # must return 62.72.12.185 before step 3

# 2. New nginx site (the old one stays enabled and serving)
ssh root@62.72.12.185
cd /root/apps/convai-voice/repo && git fetch origin main && git reset --hard origin/main
grep -rn 'server_name' /etc/nginx/sites-enabled/ | grep mannmate   # check for a wildcard
cp deploy/vps/nginx/spandan.mannmate.com.conf /etc/nginx/sites-available/spandan.mannmate.com
ln -sfn /etc/nginx/sites-available/spandan.mannmate.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx      # -t FIRST — five other sites share this nginx

# 3. Certificate
certbot --nginx -d spandan.mannmate.com

# 4. Env — both hostnames allowed during the overlap, so neither origin breaks
vim /root/apps/convai-voice/shared/.env
#   CLIENT_URL=https://spandan.mannmate.com,https://voice.herbsmagic.in
#   PUBLIC_BACKEND_WS_URL=wss://spandan.mannmate.com
#   GOOGLE_REDIRECT_URI=https://spandan.mannmate.com/api/v1/integrations/google_calendar/callback
#   GOOGLE_AUTH_REDIRECT_URI=https://spandan.mannmate.com/api/v1/auth/google/callback
pm2 restart convai-voice-api --update-env
```

`CLIENT_URL` is comma-separated and read as a CORS allowlist (`app.js:16`), so
listing both hosts is what keeps the old page working while you re-register
providers. `PUBLIC_BACKEND_WS_URL` is a single value and moves immediately —
it is only ever dialled by Twilio/Exotel, which are re-pointed in step 5.

**5. Re-register every external callback.** Each of these is a separate
dashboard, and a missed one fails *silently* rather than loudly:

| Provider | What to change |
|---|---|
| Google Cloud Console | Both redirect URIs above, on the OAuth client. Old ones can be deleted in the same edit. |
| Twilio | Voice webhook + status callback on each number → `https://spandan.mannmate.com/api/v1/...` |
| Exotel | Connect applet's Voicebot URL + status callback (`EXOTEL_STATUS_CALLBACK` if set explicitly) |
| Razorpay | Settings → Webhooks → `https://spandan.mannmate.com/api/v1/billing/razorpay/webhook`. `RAZORPAY_WEBHOOK_SECRET` is per-webhook — if you create a new one instead of editing, the secret changes and top-ups reject until `.env` matches. |
| Meta / WhatsApp | Callback URL in the app's webhook config, if WhatsApp is live |

**6. Verify on the new host before tearing anything down.**

```bash
curl -s https://spandan.mannmate.com/health
```
Then in a browser: log in, make a **web call** (proves the WS block), and make
one **inbound phone call** (proves `PUBLIC_BACKEND_WS_URL` and the media-stream
block). A phone call that greets you and then goes silent means the media
socket is wrong — see Troubleshooting.

**7. Only now, retire the old host.**

```bash
rm /etc/nginx/sites-enabled/voice.herbsmagic.in
nginx -t && systemctl reload nginx
certbot delete --cert-name voice.herbsmagic.in    # stops renewal failure mail
# keep /etc/nginx/sites-available/voice.herbsmagic.in until you are confident
```
Then drop `https://voice.herbsmagic.in` from `CLIENT_URL` in `shared/.env`,
`pm2 restart convai-voice-api --update-env`, and delete the DNS A record.

## Deploying

Manual and deliberate: SSH in, run one script.

```bash
ssh root@62.72.12.185
/root/apps/convai-voice/repo/deploy/vps/deploy.sh
```

| Flag | Use it when |
|---|---|
| `--skip-client` | The change is backend-only. Skips the 2–4 minute build and its memory spike. |
| `--skip-migrate` | Re-running a deploy whose migrations already applied. |

### Make git stop asking for a password

`deploy.sh` runs `git fetch`. If it prompts, every deploy stalls. Fix it once —
a read-only deploy key is the cleaner option:

```bash
ssh-keygen -t ed25519 -f /root/.ssh/hm_voice_deploy -N "" -C "vps-deploy"
cat /root/.ssh/hm_voice_deploy.pub
# → GitHub repo → Settings → Deploy keys → Add (leave write access OFF)

cat >> /root/.ssh/config <<'EOF'
Host github-hmvoice
  HostName github.com
  User git
  IdentityFile /root/.ssh/hm_voice_deploy
  IdentitiesOnly yes
EOF

git -C /root/apps/convai-voice/repo remote set-url origin \
  git@github-hmvoice:HerbsMagic/HM-Voice-agent.git
git -C /root/apps/convai-voice/repo fetch origin main   # verify: no prompt
```

The alternative, `git config credential.helper store`, writes a Personal Access
Token in plaintext to `/root/.git-credentials`.

### What a deploy does

1. `git fetch` + `reset --hard origin/main` — never `pull` (an unresolvable
   merge conflict on a server checkout needs a human) and never `clean -fdx`
   (it would delete `node_modules`, `client/dist` and the `.env` symlink).
2. `npm ci` in `backend/` — the **full** install, not `--omit=dev`: `prisma`
   is a devDependency and both `generate` and `migrate deploy` need the CLI.
3. `prisma generate` — every time. A stale client against a migrated schema is
   what produces "column does not exist" at runtime.
4. `prisma migrate deploy` through `DIRECT_URL` (port 5432). PgBouncer in
   transaction mode cannot execute DDL, so migrating via the 6543 pooler fails.
5. Builds the client into `dist.new`, then swaps it in with two renames.
   The running site serves the **old** bundle throughout — building straight
   into `dist/` would empty it first and serve 404s for the whole build.
6. `pm2 startOrReload ecosystem.config.cjs --only convai-voice-api`.
   > `--only` is load-bearing. 17 PM2 processes from five other projects are
   > registered here; a bare `pm2 reload` restarts all of them.
7. Health check against `127.0.0.1:4300/health`, 30s budget.

A failed health check prints the last 40 log lines and exact rollback commands,
and leaves the previous bundle at `client/dist.old`.

### The build is the risky step

This box has 2 vCPUs and ~4.3 GB free, with five other production apps on it.
`tsc && vite build` over this dependency tree can peak past 2 GB, and the kernel
picks its OOM victim by `oom_score` — so an overrun could kill a **neighbour's**
app rather than the build.

Two mitigations, both in `deploy.sh`:

- It refuses to build below **1200 MB available** and tells you to use
  `--skip-client` instead.
- The build runs under `NODE_OPTIONS=--max-old-space-size=1536`, so V8 garbage
  collects under pressure rather than growing until the kernel intervenes.

If builds become a recurring problem, the better answer is to build on your
own machine and `rsync client/dist/` up — the VPS never needs to compile.

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
| Every page returns JSON `{"error":"Not found"}` | `client/dist` is missing. `app.js:113` logs `No client build at ...`. Re-run `deploy.sh` without `--skip-client`. |
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
