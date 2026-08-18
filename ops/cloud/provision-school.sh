#!/usr/bin/env bash
# Provisioniert eine Schule (Mandant) fuer den Cloud-Betrieb (MULTI_TENANT=true).
#
# Der Cloud-Betrieb hat eine schools-Tabelle; jede Zeile ist eine Schule, die
# sich ueber den Schul-Waehler der App anmelden kann. Der Schul-Zugangscode
# wird nur als SHA-256-Hash gespeichert (siehe lib/schools.ts) — ein
# Datenbankleck gibt keine Codes preis.
#
# Aufruf:
#   DATABASE_URL=postgres://... ops/cloud/provision-school.sh <kennung> "<Name>" [zugangscode]
#
# Beispiele:
#   DATABASE_URL=... ops/cloud/provision-school.sh gymnasium-rissen "Gymnasium Rissen"
#   DATABASE_URL=... ops/cloud/provision-school.sh sts-musterweg "Stadtteilschule Musterweg" geheim123
#
# Ohne Zugangscode ist die Registrierung fuer diese Schule offen (kein
# Schul-Code-Screen). Mit Code wird jedes neue Konto erst nach Eingabe des
# Codes freigeschaltet. Idempotent: eine vorhandene Schule wird aktualisiert.

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Aufruf: $0 <kennung> \"<Name>\" [zugangscode]" >&2
  exit 1
fi

SCHOOL_ID="$1"
SCHOOL_NAME="$2"
JOIN_CODE="${3:-}"

if [[ ! "$SCHOOL_ID" =~ ^[a-z0-9_-]{1,40}$ ]]; then
  echo "Kennung ungueltig: nur Kleinbuchstaben, Ziffern, Bindestrich, Unterstrich, max. 40 Zeichen." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL ist nicht gesetzt." >&2
  exit 1
fi

HASH_SQL="NULL"
if [[ -n "$JOIN_CODE" ]]; then
  # Identisch zu lib/schools.ts: SHA-256 des Codes, hex.
  HASH_SQL="'$(printf '%s' "$JOIN_CODE" | sha256sum | cut -d' ' -f1)'"
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO schools (id, name, join_code_hash, is_active, created_at, updated_at)
VALUES ('$SCHOOL_ID', '$(printf '%s' "$SCHOOL_NAME" | sed "s/'/''/g")', $HASH_SQL, true, now(), now())
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      join_code_hash = EXCLUDED.join_code_hash,
      is_active = true,
      updated_at = now();
SQL

echo "Schule '$SCHOOL_ID' provisioniert${JOIN_CODE:+ mit Zugangscode}."
