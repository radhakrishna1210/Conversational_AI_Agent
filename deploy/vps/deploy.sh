#!/usr/bin/env bash
# Deploy Conversational_AI_Agent on the shared Hostinger VPS.
#
# Run it ON the VPS, by hand, whenever you want to ship:
#
#   ssh root@62.72.12.185
#   /root/apps/convai-voice/repo/deploy/vps/deploy.sh
#
# Flags:
#   --skip-client   backend-only deploy; skips the client build entirely.
#                   Use when the change is purely server-side — saves 2-4 min
#                   and avoids the memory spike described in step 5.
#   --skip-migrate  skips `prisma migrate deploy`. Only for re-running a failed
#                   deploy whose migrations already applied.
#
# This box runs five other production apps. Every step is scoped so a failure
# here cannot touch them — note the --only flag on pm2 in particular.

set -euo pipefail

APP_ROOT="${APP_ROOT:-/root/apps/convai-voice}"
REPO_DIR="$APP_ROOT/repo"
SHARED_DIR="$APP_ROOT/shared"
PM2_APP="convai-voice-api"
BRANCH="${DEPLOY_BRANCH:-main}"
REMOTE="${DEPLOY_REMOTE:-origin}"
HEALTH_URL="http://127.0.0.1:4300/health"
NODE_BIN="/root/.nvm/versions/node/v20.10.0/bin"

SKIP_CLIENT=0
SKIP_MIGRATE=0
SKIP_FETCH=0
for arg in "$@"; do
  case "$arg" in
    --skip-client)  SKIP_CLIENT=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    # Internal: set when this script re-execs itself after a pull updated it.
    --skip-fetch)   SKIP_FETCH=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ── Run from a snapshot, not from the repo copy ──────────────────────────────
# THIS IS NOT OPTIONAL. bash reads a script lazily, by byte offset, as it
# executes. Step 1 below runs `git reset --hard` on the repository that contains
# THIS FILE. When a pull changes deploy.sh mid-run, bash carries on reading at
# its old offset into the new file and silently executes shifted, mismatched
# lines — no error, just wrong behaviour. That produced a deploy where a guard
# clause and an npm flag were skipped entirely.
#
# Copying to /tmp first makes the file bash is reading immutable for the run.
REPO_SELF="$REPO_DIR/deploy/vps/deploy.sh"
if [ "${DEPLOY_SNAPSHOT:-}" != "1" ]; then
  find /tmp -maxdepth 1 -name 'convai-deploy.*' -mtime +1 -delete 2>/dev/null || true
  _snap="$(mktemp /tmp/convai-deploy.XXXXXX)"
  cp "$0" "$_snap"
  chmod +x "$_snap"
  # DEPLOY_SNAP_SRC records which file the snapshot was taken from, so step 1
  # can tell whether the pull changed it.
  DEPLOY_SNAPSHOT=1 DEPLOY_SNAP_SRC="$(readlink -f "$0")" exec "$_snap" "$@"
fi
# Clean up the snapshot on exit — but ONLY if we are actually running from one.
# An unguarded `rm -f "$0"` here would delete deploy.sh out of the repository on
# any path that reaches this line running the repo copy directly.
case "$0" in
  /tmp/convai-deploy.*) trap 'rm -f "$0" 2>/dev/null || true' EXIT ;;
esac

export PATH="$NODE_BIN:$PATH"

log()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Concurrency guard ────────────────────────────────────────────────────────
# Two overlapping deploys would race on `git reset --hard` and on the dist swap.
exec 9>"$APP_ROOT/.deploy.lock"
flock -n 9 || die "Another deploy is already running (lock: $APP_ROOT/.deploy.lock)"

cd "$REPO_DIR" || die "Repo not found at $REPO_DIR — run bootstrap.sh first"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Current revision: $PREVIOUS_SHA"

# ── 1. Sync code ─────────────────────────────────────────────────────────────
if [ "$SKIP_FETCH" -eq 1 ]; then
  log "Skipping fetch (already pulled by the previous stage)"
  NEW_SHA="$PREVIOUS_SHA"
else
log "Fetching $REMOTE/$BRANCH"
# If this prompts for a GitHub username/password, credentials are not cached.
# Fix once with either:
#   git config --global credential.helper store   (then fetch once to save a PAT)
#   or switch the remote to SSH with a read-only deploy key.
git fetch --prune "$REMOTE" "$BRANCH"

# reset --hard, not pull: an unresolvable merge conflict on a server checkout
# needs a human. The working tree is disposable; the branch is the truth.
#
# NOT `git clean -fdx`: that would delete node_modules, client/dist and the
# backend/.env symlink, turning every deploy into a cold rebuild.
git reset --hard "$REMOTE/$BRANCH"
NEW_SHA="$(git rev-parse HEAD)"

if [ "$PREVIOUS_SHA" = "$NEW_SHA" ]; then
  warn "Already at $NEW_SHA — redeploying the same revision anyway."
else
  log "Deploying: $PREVIOUS_SHA → $NEW_SHA"
  git --no-pager log --oneline "$PREVIOUS_SHA..$NEW_SHA" | sed 's/^/    /'
fi

# If the pull changed deploy.sh itself, hand over to the NEW version rather
# than finishing this run with the logic that shipped before it. Re-exec reads
# the file fresh from the top (and re-snapshots), so there is no offset to get
# out of sync. --skip-fetch stops it pulling a second time.
if ! cmp -s "${DEPLOY_SNAP_SRC:-$REPO_SELF}" "$REPO_SELF"; then
  log "deploy.sh changed in this pull — restarting with the updated script"
  # DEPLOY_SNAPSHOT is cleared so the new process takes its own snapshot rather
  # than running the repo copy directly.
  DEPLOY_SNAPSHOT= exec "$REPO_SELF" --skip-fetch "$@"
fi
fi

# ── 2. Environment file ──────────────────────────────────────────────────────
# Lives in $SHARED_DIR and is symlinked in, so it sits outside the working tree
# that step 1 just hard-reset.
[ -e "$REPO_DIR/backend/.env" ] || die "backend/.env symlink missing — expected → $SHARED_DIR/.env"
[ -s "$SHARED_DIR/.env" ]       || die "$SHARED_DIR/.env is empty — fill it from backend/.env.vps.example"

# ── 3. Backend dependencies ──────────────────────────────────────────────────
log "Installing backend dependencies"
cd "$REPO_DIR/backend"
# --include=dev, NOT --omit=dev: prisma (the CLI) is a devDependency and both
# `generate` and `migrate deploy` below need it. Stated explicitly because npm
# also omits dev deps whenever NODE_ENV=production is in the environment, and
# this script sources an .env that sets exactly that.
NODE_ENV=development npm ci --include=dev --no-audit --no-fund

log "Generating Prisma client"
# Every deploy, unconditionally. A stale generated client against a migrated
# schema is what produces "column does not exist" errors at runtime.
npx prisma generate

# ── 4. Migrations ────────────────────────────────────────────────────────────
if [ "$SKIP_MIGRATE" -eq 1 ]; then
  warn "Skipping migrations (--skip-migrate)"
else
  log "Applying migrations"
  # Sourced rather than run through `npm run db:migrate:prod`, because that
  # wrapper (scripts/prisma-migrate-deploy.js:3) hard-requires npm_execpath and
  # exits when invoked outside an npm lifecycle.
  #
  # This is why every value in shared/.env containing a space, #, & or @ must be
  # single-quoted — REDIS_URL especially.
  #
  # IN A SUBSHELL, deliberately. `set -a` exports everything in that file into
  # the current shell, including NODE_ENV=production — and npm reads NODE_ENV
  # and silently turns it into --omit=dev. That skipped typescript and vite in
  # the client install below, and the build died with "tsc: not found".
  # Confining the export to a subshell keeps the app's runtime config out of
  # the build environment entirely.
  (
    set -a
    # shellcheck disable=SC1091
    . "$SHARED_DIR/.env"
    set +a
    [ -n "${DIRECT_URL:-}" ] || die "DIRECT_URL unset — migrations need the direct 5432 connection, not the pooler"
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy
  )
fi

# ── 5. Client build ──────────────────────────────────────────────────────────
# THIS IS THE RISKY STEP ON THIS BOX. 2 vCPUs, ~4.3GB free, and five other
# production apps (four of them already in restart loops). `tsc && vite build`
# over this dependency tree — Radix + GSAP + Recharts + framer-motion — can peak
# past 2GB. An OOM kill here would be chosen by the kernel on an oom_score
# basis, meaning it could take out a NEIGHBOUR's app rather than this build.
#
# Two mitigations, both load-bearing:
#   1. --max-old-space-size caps V8's heap so it garbage-collects under pressure
#      instead of growing until the kernel intervenes.
#   2. The build writes to dist.new and is swapped in atomically, so the running
#      site keeps serving the OLD bundle for the whole 2-4 minutes. Building
#      straight into dist/ would empty it first and serve 404s meanwhile.
if [ "$SKIP_CLIENT" -eq 1 ]; then
  warn "Skipping client build (--skip-client)"
  [ -f "$REPO_DIR/client/dist/index.html" ] || die "--skip-client, but no existing client/dist to keep"
else
  log "Building client (2-4 min — the site keeps serving the old bundle)"
  cd "$REPO_DIR/client"

  AVAIL_MB="$(free -m | awk '/^Mem:/ {print $7}')"
  echo "  available memory: ${AVAIL_MB}MB"
  if [ "$AVAIL_MB" -lt 1200 ]; then
    die "Only ${AVAIL_MB}MB available. Building now risks an OOM kill that could hit another app. Free memory first, or deploy with --skip-client."
  fi

  # --include=dev is explicit and required. vite and typescript are
  # devDependencies, and npm silently omits those whenever NODE_ENV=production
  # is in the environment — which is exactly what shared/.env sets. The subshell
  # in step 4 already prevents that leak; this flag means the build still works
  # even if NODE_ENV arrives from somewhere else (a login shell, a cron env).
  NODE_ENV=development npm ci --include=dev --no-audit --no-fund

  # Fail here with a useful message rather than letting npm run build die with
  # the near-meaningless "sh: 1: tsc: not found".
  [ -x node_modules/.bin/tsc ] && [ -x node_modules/.bin/vite ] \
    || die "typescript/vite missing after npm ci — devDependencies were omitted. Check for NODE_ENV=production in the environment."

  rm -rf dist.new
  # `npm run build -- --outDir dist.new` appends the flag to the end of the
  # script string ("tsc && vite build"), so it reaches vite, not tsc.
  NODE_OPTIONS="--max-old-space-size=1536" npm run build -- --outDir dist.new --emptyOutDir

  [ -f dist.new/index.html ] || die "Build produced no dist.new/index.html"

  # Atomic-ish swap: two renames within the same filesystem. The window where
  # dist/ does not exist is sub-millisecond.
  rm -rf dist.old
  [ -d dist ] && mv dist dist.old
  mv dist.new dist
  log "Client build installed"
fi

# app.js:113 logs "No client build at ..." and then answers every page request
# with a JSON 404. Fail loudly here instead of shipping that.
[ -f "$REPO_DIR/client/dist/index.html" ] || die "client/dist/index.html missing after build step"

# ── 6. Restart ───────────────────────────────────────────────────────────────
log "Reloading PM2 app: $PM2_APP"
cd "$REPO_DIR"
# --only is load-bearing. 17 PM2 processes belonging to five other projects are
# registered on this box; a bare `pm2 reload` restarts every one of them.
pm2 startOrReload ecosystem.config.cjs --only "$PM2_APP" --update-env

# Persists the list across reboots via the existing pm2-root systemd unit.
# NOTE: this rewrites /root/.pm2/dump.pm2 with the CURRENT state of ALL apps,
# not just this one.
pm2 save --force

# ── 7. Health check ──────────────────────────────────────────────────────────
log "Waiting for $HEALTH_URL"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    log "Healthy after ${i}s"
    curl -fsS "$HEALTH_URL"; echo
    rm -rf "$REPO_DIR/client/dist.old"
    log "Deploy complete: $NEW_SHA"
    exit 0
  fi
  sleep 1
done

# ── Failure path ─────────────────────────────────────────────────────────────
printf '\n\033[1;31m✗ Health check failed after 30s. Last 40 log lines:\033[0m\n' >&2
pm2 logs "$PM2_APP" --lines 40 --nostream >&2 || true
cat <<EOF >&2

The previous client bundle is still at $REPO_DIR/client/dist.old

Roll back with:
  cd $REPO_DIR && git reset --hard $PREVIOUS_SHA
  cd backend && npm ci --no-audit --no-fund && npx prisma generate
  cd $REPO_DIR && rm -rf client/dist && mv client/dist.old client/dist
  pm2 restart $PM2_APP --update-env

Most likely causes, in order:
  1. Port 4300 taken     → ss -tlpn | grep 4300
  2. Missing env var     → env.js throws on boot; the reason is in the log above
  3. DATABASE_URL wrong  → must be the Supabase POOLER string (port 6543)
  4. REDIS_URL unquoted  → the password contains # and @; it must be
                           percent-encoded AND single-quoted in shared/.env
EOF
exit 1
