#!/usr/bin/env bash
set -euo pipefail

name="hard-problem-rundown-test-$$"
root="$(cd "$(dirname "$0")/.." && pwd)"
output="$(mktemp)"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap 'cleanup; rm -f "$output"' EXIT

docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=postgres -v "$root:/repo:ro" postgres:16 >/dev/null
until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker exec -w /repo/supabase/tests "$name" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f 012_live_rundown_rls_test.sql 2>&1 | tee "$output"
if grep -q 'FAIL:' "$output"; then
  echo "Database security suite reported a failed invariant" >&2
  exit 1
fi
