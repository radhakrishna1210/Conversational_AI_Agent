#!/usr/bin/env bash
# reports/scripts/rerun_static_gates.sh
#
# Re-run every gate that needs no external approval, in one sitting, and
# leave the unedited output under an evidence directory. Another engineer
# runs this after checkout to reproduce the FINAL_REPORT numbers that are
# not latency (those come from run_latency_arms.sh) or a live carrier call.
#
#   bash reports/scripts/rerun_static_gates.sh [evidence-dir]
#
# Exit code is the number of failed gates. Nothing here writes to a database:
# the backend suites are unit tests, the transfer-callback tests stub Prisma,
# and the integration suites self-skip unless TEST_DATABASE_URL is set to a
# disposable database (never production).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EV="${1:-$ROOT/reports/evidence/$(date +%F)_gates}"
mkdir -p "$EV"
fails=0
run() { # name, dir, command...
  local name="$1"; local dir="$2"; shift 2
  echo "== $name"
  ( cd "$dir" && "$@" ) > "$EV/$name.log" 2>&1
  local rc=$?
  echo "exit=$rc" >> "$EV/$name.log"
  echo "   exit=$rc → $EV/$name.log"
  [ "$rc" -eq 0 ] || fails=$((fails+1))
}
{
  echo "commit $(git -C "$ROOT" rev-parse HEAD)"
  echo "branch $(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  echo "start  $(date -Is)"
  echo "node   $(node -v)  npm $(npm -v)"
  echo "os     $(uname -srm 2>/dev/null || ver)"
  echo "env    $(grep -c '=' "$ROOT/backend/.env" 2>/dev/null || echo 0) vars in backend/.env (values not recorded)"
  echo "db     $(grep -E '^DATABASE_URL=' "$ROOT/backend/.env" 2>/dev/null | sed -E 's#(://[^:]+:)[^@]+@#\1***@#; s#^DATABASE_URL=##' | cut -c1-80)"
} > "$EV/00_session.txt"

run 01_backend_npm_test          "$ROOT/backend" npm test
run 02_backend_test_ws           "$ROOT/backend" npm run test:ws
run 03_backend_test_voice        "$ROOT/backend" npm run test:voice
run 04_backend_test_stt          "$ROOT/backend" npm run test:stt
run 05_client_tsc                "$ROOT/client"  npx tsc --noEmit
run 06_client_lint_ratchet       "$ROOT/client"  node scripts/lint-ratchet.mjs
run 07_client_build              "$ROOT/client"  npm run build
run 08_backend_audit_prod        "$ROOT/backend" npm audit --omit=dev
run 09_client_audit_prod         "$ROOT/client"  npm audit --omit=dev
run 10_prisma_validate           "$ROOT/backend" npx prisma validate
run 11_backend_syntax            "$ROOT/backend" bash -c 'for f in $(git ls-files "src/**/*.js" "scripts/*.mjs" "scripts/*.js"); do node --check "$f" || exit 1; done; echo all-ok'
run 12_secret_scan               "$ROOT" bash -c 'git grep -nE "AIza[0-9A-Za-z_-]{30,}|gsk_[0-9A-Za-z]{40,}|sk-[0-9A-Za-z]{40,}|xai-[0-9A-Za-z]{40,}" -- . ":!*.log" ":!reports/evidence/**" | sed -E "s/(AIza|gsk_|sk-|xai-)[0-9A-Za-z_-]{6}[0-9A-Za-z_-]*/\1***REDACTED***/g"; test $? -eq 0 && echo "0 hits"'
run 13_import_time_bridge        "$ROOT/backend" node -e 'const t=performance.now(); import("./src/ws/modularMediaBridge.js").then(()=>{console.log("import ms", Math.round(performance.now()-t)); process.exit(0)})'

# The client lint gate itself, unfiltered, for the record (it is expected to
# fail while the baselined `any`s remain; the ratchet above is the gate).
( cd "$ROOT/client" && npm run lint ) > "$EV/14_client_lint_full.log" 2>&1; echo "exit=$?" >> "$EV/14_client_lint_full.log"

echo "end    $(date -Is)" >> "$EV/00_session.txt"
echo "failed gates: $fails" | tee -a "$EV/00_session.txt"
exit "$fails"
