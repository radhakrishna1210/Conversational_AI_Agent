#!/usr/bin/env bash
# ONE-TIME setup of Conversational_AI_Agent on the shared Hostinger VPS.
# Idempotent — safe to re-run. Run as root:
#
#   bash bootstrap.sh
#
# Deliberately does NOT change anything belonging to the four apps already on
# this box. The two settings that WOULD affect them (redis maxmemory-policy and
# the ufw rules) are reported for you to action, not changed automatically.

set -euo pipefail

APP_ROOT="/root/apps/convai-voice"
REPO_URL="${REPO_URL:-https://github.com/HerbsMagic/HM-Voice-agent.git}"
BRANCH="${DEPLOY_BRANCH:-main}"
DOMAIN="voice.herbsmagic.in"
PORT="4300"
NODE_BIN="/root/.nvm/versions/node/v20.10.0/bin"

export PATH="$NODE_BIN:$PATH"

log()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. Preflight ─────────────────────────────────────────────────────────────
log "Preflight"

[ "$(id -u)" -eq 0 ] || die "Run as root"

NODE_VER="$(node -v)"
echo "  node: $NODE_VER ($(command -v node))"
case "$NODE_VER" in
  v2[0-9].*|v[3-9][0-9].*) ;;
  # --env-file (used by ecosystem.config.cjs) landed in 20.6. The system
  # /usr/bin/node on this box is older than the nvm one — hence the PATH pin.
  *) die "Node >= 20.6 required, found $NODE_VER. Expected $NODE_BIN/node" ;;
esac

if ss -tlpnH 2>/dev/null | grep -q ":$PORT "; then
  ss -tlpn | grep ":$PORT " >&2
  die "Port $PORT is already in use. Pick another and update .env, ecosystem.config.cjs and the nginx conf together."
fi
echo "  port $PORT: free"

command -v pm2 >/dev/null || die "pm2 not found"
echo "  pm2: $(pm2 --version)"

command -v flock >/dev/null || die "flock not found (util-linux) — deploy.sh uses it as a concurrency guard"

# The client is built on this box, so the build needs headroom. deploy.sh
# re-checks at build time and refuses below 1200MB.
AVAIL_MB="$(free -m | awk '/^Mem:/ {print $7}')"
echo "  available memory: ${AVAIL_MB}MB"
[ "$AVAIL_MB" -ge 1200 ] || warn "Below 1200MB — deploy.sh will refuse to build the client until memory frees up."

# ── 1. Directory layout ──────────────────────────────────────────────────────
# Everything mutable lives OUTSIDE the git working tree, because deploy.sh runs
# `git reset --hard` on every deploy.
#
#   $APP_ROOT/repo            git checkout (disposable)
#   $APP_ROOT/shared/.env     real env file, symlinked into repo/backend/
#   $APP_ROOT/shared/uploads  UPLOAD_DIR — KB files, cloned voices, recordings
#   $APP_ROOT/logs            pm2 stdout/stderr
log "Creating layout under $APP_ROOT"
mkdir -p "$APP_ROOT"/{shared/uploads,logs}

# ── 2. Clone ─────────────────────────────────────────────────────────────────
if [ -d "$APP_ROOT/repo/.git" ]; then
  log "Repo already present — fetching"
  git -C "$APP_ROOT/repo" fetch --prune origin "$BRANCH"
else
  log "Cloning $REPO_URL ($BRANCH)"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_ROOT/repo"
fi

# ── 3. Env file ──────────────────────────────────────────────────────────────
if [ ! -f "$APP_ROOT/shared/.env" ]; then
  cp "$APP_ROOT/repo/backend/.env.vps.example" "$APP_ROOT/shared/.env"
  chmod 600 "$APP_ROOT/shared/.env"
  warn "Created $APP_ROOT/shared/.env from the template — FILL IT IN before deploying."
  warn "ENCRYPTION_KEY must be copied verbatim from your local backend/.env."
  warn "A new value makes every OAuth token already in Supabase undecryptable."
else
  log "shared/.env already exists — left untouched"
fi
ln -sfn "$APP_ROOT/shared/.env" "$APP_ROOT/repo/backend/.env"

# ── 4. Redis ─────────────────────────────────────────────────────────────────
# Shared with another project on this box, and password-protected.
log "Redis"
REDIS_PASS="$(grep -oP '^\s*requirepass\s+\K\S+' /etc/redis/redis.conf 2>/dev/null || true)"
if [ -z "$REDIS_PASS" ]; then
  warn "No requirepass found in /etc/redis/redis.conf — check for an include file."
else
  echo "  password: found in /etc/redis/redis.conf"
  # Percent-encode it. The password on this box is "#Herbs@1234": the '@' would
  # make the URL parser read the host as "1234@127.0.0.1", and '#' would start a
  # URL fragment — and, separately, begin a comment when deploy.sh sources the
  # .env file. Printing the raw password here produced a URL that silently
  # pointed at the wrong host.
  urlencode() {
    local s="$1" out="" c i
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9.~_-]) out+="$c" ;;
        *) out+=$(printf '%%%02X' "'$c") ;;
      esac
    done
    printf '%s' "$out"
  }
  echo "  REDIS_URL='redis://:$(urlencode "$REDIS_PASS")@127.0.0.1:6379/3'"
  echo "  (percent-encoded, and single-quoted because .env is sourced by deploy.sh)"
  POLICY="$(redis-cli -a "$REDIS_PASS" --no-auth-warning CONFIG GET maxmemory-policy 2>/dev/null | tail -1)"
  echo "  maxmemory-policy: ${POLICY:-unknown}"
  if [ "$POLICY" != "noeviction" ]; then
    warn "BullMQ REQUIRES noeviction. Under '${POLICY}' redis silently drops queued jobs under memory pressure."
    warn "This is a GLOBAL setting shared with the other project using this instance."
    warn "Check what else is in there first:  redis-cli -a <pass> INFO keyspace"
    warn "Then, if safe:  redis-cli -a <pass> CONFIG SET maxmemory-policy noeviction"
    warn "  and persist it in /etc/redis/redis.conf so it survives a restart."
  fi
  echo "  keyspace in use (db3 must be free for this project):"
  redis-cli -a "$REDIS_PASS" --no-auth-warning INFO keyspace 2>/dev/null | sed 's/^/    /'
fi

# ── 5. PM2 log rotation ──────────────────────────────────────────────────────
# Without this the voice pipeline's per-turn logging fills the disk. 60GB free
# today, but this app logs far more per request than the neighbours.
if pm2 list 2>/dev/null | grep -q pm2-logrotate; then
  log "pm2-logrotate already installed"
else
  log "Installing pm2-logrotate"
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 20M
  pm2 set pm2-logrotate:retain 14
  pm2 set pm2-logrotate:compress true
fi

# ── 6. nginx ─────────────────────────────────────────────────────────────────
log "nginx"
SITE_SRC="$APP_ROOT/repo/deploy/vps/nginx/$DOMAIN.conf"
SITE_DST="/etc/nginx/sites-available/$DOMAIN"
if [ -f "$SITE_DST" ]; then
  warn "$SITE_DST exists — not overwriting (certbot may have edited it)."
  warn "Diff against the repo version: diff $SITE_DST $SITE_SRC"
else
  cp "$SITE_SRC" "$SITE_DST"
  ln -sfn "$SITE_DST" "/etc/nginx/sites-enabled/$DOMAIN"
  # -t before reload: a syntax error here would take down all five existing
  # sites, not just this one.
  nginx -t || die "nginx config test failed — NOT reloading. The other 5 sites are unaffected."
  systemctl reload nginx
  log "Site enabled. Now issue the certificate:"
  echo "    certbot --nginx -d $DOMAIN"
  echo "  (DNS A record for $DOMAIN must already point at 62.72.12.185)"
fi

# ── 7. Firewall ──────────────────────────────────────────────────────────────
# Nothing to open: nginx already has 80/443 and the app binds 127.0.0.1 only.
log "Firewall — no changes needed (app is proxied, not exposed directly)"
warn "Unrelated, but noted during the audit: ufw allows 27017 (mongod, bound"
warn "to 0.0.0.0) from Anywhere, plus 5173/5174/9090/3000/5000. Consider:"
warn "  ufw delete allow 27017 && ufw delete allow 27017/tcp"
warn "  ufw delete allow 5173  && ufw delete allow 5174"

cat <<EOF

────────────────────────────────────────────────────────────────────────
Bootstrap complete. Remaining manual steps:

  1. Fill in $APP_ROOT/shared/.env  (template: backend/.env.vps.example)
  2. certbot --nginx -d $DOMAIN
  3. Set maxmemory-policy to noeviction if safe (see Redis section above)
  4. First deploy:  $APP_ROOT/repo/deploy/vps/deploy.sh
  5. Point Twilio + Razorpay webhooks at https://$DOMAIN
────────────────────────────────────────────────────────────────────────
EOF
