#!/usr/bin/env bash
# ============================================================================
# Apply every migration from zero against a stock Postgres and run the plain-SQL
# assertion harness.
#
# This is a SMOKE CHECK for when the Supabase stack is unavailable. It does not
# reproduce GoTrue, Storage or the real grant matrix, so
# `npm run db:test` (pgTAP against real Supabase) remains the authority.
#
# Usage: bash scripts/verify-db-local.sh
# ============================================================================
set -euo pipefail

export MSYS_NO_PATHCONV=1   # stop Git Bash rewriting /tmp into a Windows path

CONTAINER=fit-pgcheck
IMAGE=${PG_IMAGE:-postgres:16-alpine}
DB=fit

cleanup() {
  if [ "${KEEP_CONTAINER:-0}" != "1" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "==> starting $IMAGE"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB" \
  -p 55432:5432 "$IMAGE" >/dev/null

until docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; do
  sleep 1
done
echo "    ready: $(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc 'select version()' | cut -d, -f1)"

psql_file() {
  docker cp "$1" "$CONTAINER:/tmp/$(basename "$1")" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "/tmp/$(basename "$1")"
}

echo "==> shim"
psql_file supabase/tests/_local_shim.sql

echo "==> migrations"
for f in supabase/migrations/*.sql; do
  printf '    %-52s' "$(basename "$f")"
  psql_file "$f"
  echo "ok"
done

echo "==> seed"
psql_file supabase/seed.sql

echo "==> assertions"
docker cp supabase/tests/_local_verify.sql "$CONTAINER:/tmp/verify.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f /tmp/verify.sql

echo
echo "==> all checks passed"
