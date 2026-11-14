#!/usr/bin/env bash
# Clean demo start: backend on :8000 (DEMO_MODE=true replays cached analysis; precedent index is local), health gate, baseline reset.
# Usage: backend/scripts/start_demo.sh            (then, in another terminal: cd frontend && npm run build && npm run preview -- --port 4173)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8000}"
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Stop the old backend first (it may be stale code): lsof -iTCP:$PORT -sTCP:LISTEN" >&2
  exit 1
fi
export DEMO_MODE="${DEMO_MODE:-true}"
python3 -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" > "${TMPDIR:-/tmp}/insaaf_demo_backend.log" 2>&1 &
PID=$!
echo "backend pid $PID (log: ${TMPDIR:-/tmp}/insaaf_demo_backend.log)"
for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$PORT/v1/health/deep" >/dev/null 2>&1 && break; sleep 1; done
curl -fs "http://127.0.0.1:$PORT/v1/health/deep" || { echo "backend did not become healthy" >&2; kill "$PID"; exit 1; }
echo
TOKEN=$(curl -fs -X POST "http://127.0.0.1:$PORT/v1/auth/login" -H 'content-type: application/json' \
  -d "{\"user_id\":\"senior_1\",\"password\":\"$(python3 -c 'import json;print(json.load(open(".demo_credentials"))["passwords"]["senior_1"])')\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -fs -X POST "http://127.0.0.1:$PORT/v1/demo/reset" -H "Authorization: Bearer $TOKEN"; echo
curl -fs "http://127.0.0.1:$PORT/v1/matters" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;[print(" ",m["id"],m["status"],m["title"]) for m in json.load(sys.stdin)]'
echo "READY. Sign in as senior_1 / junior_1 / clerk_1 / student_1 (Chamber A) or senior_b (Chamber B) with the seeded demo password."
