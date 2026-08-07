#!/usr/bin/env bash
# Deploy Conversational_AI_Agent on the shared Hostinger VPS.
#
# Runs ON the VPS. Invoked by .github/workflows/deploy-vps.yml over SSH after
# CI has rsync'd a freshly built client into $APP_ROOT/.deploy-incoming/dist.
# Safe to run by hand: ssh root@62.72.12.185 '/root/apps/convai-voice/repo/deploy/vps/deploy.sh'
#
# This box runs four other production apps. Every step below is scoped so that
# a failure here cannot touch them — see the --only flag on pm2 and the
# nginx-free footprint of this script.

set -euo pipefail

APP_ROOT="${APP_ROOT:-/root/apps/convai-voice}"
REPO_DIR="$APP_ROOT/repo"
SHARED_DIR="$APP_ROOT/shared"
INCOMING_DIST="$APP_ROOT/.deploy-incoming/dist"
PM2_APP="convai-voice-api"
BRANCH="${DEPLOY_BRANCH:-main}"
REMOTE="${DEPLOY_REMOTE:-origin}"
HEALTH_URL="http://127.0.0.1:4300/health"
NODE_BIN="/root/.nvm/versions/node/v20.10.0/bin"

export PATH="$NODE_BIN:$PATH"

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Concurrency guard ────────────────────────────────────────────────────────
# Two overlapping deploys would race on `git reset --hard` and `prisma migrate
# deploy`. flock makes the second one fail fast instead of corrupting the tree.
exec 9>"$APP_ROOT/.deploy.lock"
flock -n 9 || die "Another deploy is already running (lock held on $APP_ROOT/.deploy.lock)"

cd "$REPO_DIR" || die "Repo not found at $REPO_DIR — run bootstrap.sh first"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Current revision: $PREVIOUS_SHA"

# ── 1. Sync code ─────────────────────────────────────────────────────────────
log "Fetching $REMOTE/$BRANCH"
git fetch --prune "$REMOTE" "$BRANCH"
# reset --hard, not pull: a merge conflict on a server checkout is unrecoverable
# without a human. The VPS working tree is disposable; the branch is the truth.
#
# NOT `git clean -fdx`: that would delete client/dist (gitignored, rsync'd from
# CI), backend/node_modules, and backend/.env — every deploy would become a
# cold rebuild and the env symlink would vanish.
git reset --hard "$REMOTE/$BRANCH"
NEW_SHA="$(git rev-parse HEAD)"
log "Deploying revision: $NEW_SHA"

# ── 2. Environment file ──────────────────────────────────────────────────────
# Kept in $SHARED_DIR and symlinked in, so it is outside the working tree that
# step 1 just hard-reset. bootstrap.sh creates it; this only verifies.
[ -e "$REPO_DIR/backend/.env" ] || die "backend/.env symlink missing — expected → $SHARED_DIR/.env"
[ -s "$SHARED_DIR/.env" ]       || die "$SHARED_DIR/.env is empty — fill it from backend/.env.vps.example"

# ── 3. Backend dependencies ──────────────────────────────────────────────────
log "Installing backend dependencies"
cd "$REPO_DIR/backend"
# `npm ci`, not `npm ci --omit=dev`: prisma (the CLI) is a devDependency and
# both `prisma generate` and `prisma migrate deploy` below need it. Omitting dev
# deps here is the single most common way this deploy breaks.
npm ci --no-audit --no-fund

log "Generating Prisma client"
# Must run on every deploy. A stale generated client against a migrated schema
# is what produces the notorious "column does not exist" errors at runtime.
npx prisma generate

# ── 4. Migrations ────────────────────────────────────────────────────────────
# Sourced rather than passed through `npm run db:migrate:prod`, because that
# script (scripts/prisma-migrate-deploy.js:3) hard-requires npm_execpath and
# exits when invoked outside an npm lifecycle.
log "Applying migrations"
set -a
# shellcheck disable=SC1091
. "$SHARED_DIR/.env"
set +a
[ -n "${DIRECT_URL:-}" ] || die "DIRECT_URL unset — migrations run through the direct 5432 connection, not the pooler"
# Advisory locks are disabled for the same reason the repo's own wrapper script
# disables them: Supabase's pooler does not support them.
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy

# ── 5. Client build (from CI) ────────────────────────────────────────────────
# The React build runs in GitHub Actions, not here. This VM has 2 vCPUs, ~4.3GB
# free and 17 PM2 processes; `tsc && vite build` over this dependency tree peaks
# past 2GB and an OOM kill would take out a neighbouring app, not just this one.
if [ -d "$INCOMING_DIST" ] && [ -f "$INCOMING_DIST/index.html" ]; then
  log "Installing client build from CI"
  rm -rf "$REPO_DIR/client/dist.old"
  [ -d "$REPO_DIR/client/dist" ] && mv "$REPO_DIR/client/dist" "$REPO_DIR/client/dist.old"
  mkdir -p "$REPO_DIR/client"
  # mv, not cp: atomic within the same filesystem, so there is no window where
  # nginx could serve a half-copied bundle.
  mv "$INCOMING_DIST" "$REPO_DIR/client/dist"
  # Remove only the dist/ we just consumed, NOT the .deploy-incoming parent.
  # rsync 3.1.3 (Ubuntu 20.04) has no --mkpath and will not create two missing
  # path levels, so deleting the parent here breaks the NEXT deploy's upload.
  rm -rf "$INCOMING_DIST"
elif [ -f "$REPO_DIR/client/dist/index.html" ]; then
  log "No incoming build — keeping the existing client/dist"
else
  # app.js:113 logs "No client build at ..." and answers every page request with
  # a JSON 404. Fail here instead, so a broken deploy is obvious in CI logs.
  die "No client build available and none present. CI rsync step must have failed."
fi

# ── 6. Restart ───────────────────────────────────────────────────────────────
log "Reloading PM2 app: $PM2_APP"
cd "$REPO_DIR"
# --only is load-bearing. 17 PM2 processes belonging to four other projects are
# registered on this box; a bare `pm2 reload` restarts every one of them.
pm2 startOrReload ecosystem.config.cjs --only "$PM2_APP" --update-env

# Persists the process list across reboots via the existing pm2-root systemd
# unit. Note this rewrites /root/.pm2/dump.pm2 with the CURRENT state of all
# apps, which is intended — but it means any app manually stopped and not meant
# to come back will be captured as stopped.
pm2 save --force

# ── 7. Health check ──────────────────────────────────────────────────────────
log "Waiting for $HEALTH_URL"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    log "Healthy after ${i}s"
    curl -fsS "$HEALTH_URL"; echo
    log "Deploy complete: $PREVIOUS_SHA → $NEW_SHA"
    rm -rf "$REPO_DIR/client/dist.old"
    exit 0
  fi
  sleep 1
done

# ── Failure path ─────────────────────────────────────────────────────────────
printf '\n\033[1;31m✗ Health check failed after 30s. Last 40 log lines:\033[0m\n' >&2
pm2 logs "$PM2_APP" --lines 40 --nostream >&2 || true
cat <<EOF >&2

Roll back with:
  cd $REPO_DIR && git reset --hard $PREVIOUS_SHA
  cd backend && npm ci --no-audit --no-fund && npx prisma generate
  cd $REPO_DIR && pm2 restart $PM2_APP --update-env

Most likely causes, in order:
  1. Port 4300 taken     → ss -tlpn | grep 4300
  2. Missing env var     → env.js throws on boot; the reason is in the log above
  3. DATABASE_URL wrong  → must be the Supabase POOLER string (port 6543)
  4. Redis auth          → REDIS_URL needs the password and /3 db index
EOF
exit 1
