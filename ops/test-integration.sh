#!/usr/bin/env bash
set -euo pipefail

# Die Tenant-Isolations-Integrationstests (tenantIsolation + multiTenant)
# laufen nur gegen eine echte PostgreSQL und werden sonst still uebersprungen.
# Dieses Skript startet die Test-DB, spielt Migrationen ein und fuehrt den
# kompletten Testlauf aus. Aufruf: bash ops/test-integration.sh

cd "$(dirname "$0")/.."

export DATABASE_URL="postgres://test:test@localhost:5432/schulsani_test"
export INTEGRATION_DATABASE_URL="$DATABASE_URL"

docker compose -f docker-compose.test.yml up -d

# Warten, bis die Datenbank Verbindungen annimmt.
for _ in $(seq 1 30); do
  if docker compose -f docker-compose.test.yml exec -T postgres pg_isready -U test >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/api-server run test
