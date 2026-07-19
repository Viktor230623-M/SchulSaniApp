#!/usr/bin/env bash
# Erstellt einen verschluesselten Dump der SchulSani-Datenbank und entfernt
# Sicherungen, die aelter als die im Loeschkonzept festgelegten 30 Tage sind.
set -euo pipefail

DB_NAME="schulSani"
DB_USER="saniadmin"
BACKUP_DIR="/var/backups/schulsani"
KEY_FILE="/root/.schulsani-backup.key"
RETENTION_DAYS=30

if [[ ! -r "$KEY_FILE" ]]; then
  echo "Passphrase-Datei $KEY_FILE fehlt oder ist nicht lesbar." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d-%H%M)"
TARGET="$BACKUP_DIR/schulsani-$STAMP.dump.gpg"

sudo -u postgres pg_dump --format=custom --no-owner "$DB_NAME" \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$KEY_FILE" --output "$TARGET"

chmod 600 "$TARGET"

SIZE="$(stat -c %s "$TARGET")"
if [[ "$SIZE" -lt 1024 ]]; then
  echo "Sicherung $TARGET ist nur $SIZE Bytes gross — Abbruch." >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'schulsani-*.dump.gpg' -type f -mtime "+$RETENTION_DAYS" -delete

echo "Sicherung erstellt: $TARGET ($SIZE Bytes)"
