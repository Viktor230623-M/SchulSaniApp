#!/usr/bin/env bash
# Spielt die juengste Sicherung in eine Wegwerf-Datenbank ein und vergleicht
# die Zeilenzahlen mit dem Produktivbestand. Danach wird die Kopie geloescht.
set -euo pipefail

BACKUP_DIR="/var/backups/schulsani"
KEY_FILE="/root/.schulsani-backup.key"
SOURCE_DB="schulSani"
TEST_DB="schulsani_restore_test"

LATEST="$(ls -1t "$BACKUP_DIR"/schulsani-*.dump.gpg 2>/dev/null | head -1)"
if [[ -z "$LATEST" ]]; then
  echo "Keine Sicherung gefunden." >&2
  exit 1
fi

echo "Pruefe: $LATEST"

TMP_DUMP="$(mktemp /tmp/schulsani-restore-XXXXXX.dump)"
trap 'rm -f "$TMP_DUMP"' EXIT

gpg --batch --yes --decrypt --passphrase-file "$KEY_FILE" \
    --output "$TMP_DUMP" "$LATEST"
chmod 644 "$TMP_DUMP"

sudo -u postgres dropdb --if-exists "$TEST_DB"
sudo -u postgres createdb "$TEST_DB"
sudo -u postgres pg_restore --no-owner --dbname "$TEST_DB" "$TMP_DUMP"

FAILED=0
for TABLE in incident_reports users missions news loa; do
  SRC="$(sudo -u postgres psql -tAc "select count(*) from $TABLE" "$SOURCE_DB")"
  DST="$(sudo -u postgres psql -tAc "select count(*) from $TABLE" "$TEST_DB")"
  if [[ "$SRC" == "$DST" ]]; then
    echo "  $TABLE: $DST Zeilen — ok"
  else
    echo "  $TABLE: Produktiv $SRC, Wiederherstellung $DST — ABWEICHUNG" >&2
    FAILED=1
  fi
done

sudo -u postgres dropdb "$TEST_DB"

if [[ "$FAILED" -ne 0 ]]; then
  echo "Wiederherstellungsprobe fehlgeschlagen." >&2
  exit 1
fi

echo "Wiederherstellungsprobe erfolgreich."
