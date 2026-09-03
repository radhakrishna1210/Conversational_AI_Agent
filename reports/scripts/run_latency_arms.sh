#!/usr/bin/env bash
# reports/scripts/run_latency_arms.sh
#
# Measure the modular web-call transport end to end, one ARM at a time, with a
# fresh backend per arm so every arm runs the same code under a different
# runtime setting. Each arm: start backend on $PORT against the DISPOSABLE
# database, run scripts/measure-webcall.mjs for $TURNS turns, stop the backend.
#
#   TEST_DATABASE_URL=postgresql://postgres:test@localhost:5499/hm_test \
#   TEST_REDIS_URL=redis://localhost:6390 \
#   SAMPLES=/path/to/24k-mono-pcm16-wavs OUT=reports/evidence/<ts>/latency \
#   TURNS=30 ARMS="spec_off:VOICE_SPECULATION=off spec_candidate:VOICE_SPECULATION=candidate spec_interim:VOICE_SPECULATION=interim" \
#   bash reports/scripts/run_latency_arms.sh
#
# Never points at production: refuses a TEST_DATABASE_URL that does not look
# disposable, exactly like scripts/seed-test-db.mjs.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
PORT="${PORT:-4100}"
TURNS="${TURNS:-30}"
OUT="${OUT:-$ROOT/reports/evidence/$(date +%F)_latency}"
SAMPLES="${SAMPLES:?SAMPLES dir of WAVs required}"
ARMS="${ARMS:-spec_off:VOICE_SPECULATION=off spec_candidate:VOICE_SPECULATION=candidate spec_interim:VOICE_SPECULATION=interim}"
DB="${TEST_DATABASE_URL:?TEST_DATABASE_URL required}"
REDIS="${TEST_REDIS_URL:-redis://localhost:6390}"
case "$DB" in
  *supabase*|*pooler*|*prod*) echo "refusing: TEST_DATABASE_URL looks like production"; exit 3;;
esac
mkdir -p "$OUT"
echo "commit $(git -C "$ROOT" rev-parse HEAD) $(date -Is)" | tee "$OUT/arms_session.txt"

stop_backend() {
  local pid
  pid=$(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTEN | head -1 | awk '{print $NF}')
  if [ -n "${pid:-}" ]; then
    if command -v taskkill >/dev/null 2>&1; then taskkill //PID "$pid" //F >/dev/null 2>&1; else kill "$pid" 2>/dev/null; fi
  fi
  sleep 1
}

for arm in $ARMS; do
  name="${arm%%:*}"; envs="${arm#*:}"
  stop_backend
  echo "== arm $name ($envs) =="
  (
    cd "$BACKEND" || exit 1
    # shellcheck disable=SC2086
    env PORT="$PORT" DATABASE_URL="$DB" DIRECT_URL="$DB" REDIS_URL="$REDIS" NODE_ENV=development $envs \
      node --env-file=.env src/server.js > "$OUT/server_$name.log" 2>&1 &
  )
  for i in $(seq 1 40); do grep -q "Server running" "$OUT/server_$name.log" 2>/dev/null && break; sleep 1; done
  sleep 6 # voice sync + provider warm-up
  (
    cd "$BACKEND" || exit 1
    node --env-file=.env scripts/measure-webcall.mjs --url "ws://localhost:$PORT" --samples "$SAMPLES" \
      --turns "$TURNS" --label "$name" --out "$OUT" 2>&1 | tee "$OUT/harness_${name}_console.txt" | grep -E "^#|\"turns\"|\"failed\"|\"cutOff\""
  )
  stop_backend
done
# Join the harness rows with the pipeline records and print the per-arm report.
for arm in $ARMS; do
  name="${arm%%:*}"
  (cd "$BACKEND" && node scripts/latency-report.mjs --harness "$OUT/harness_$name.jsonl" --label "$name" --out "$OUT/report_$name" > "$OUT/report_$name.md" 2>&1)
  echo "report: $OUT/report_$name.md"
done
