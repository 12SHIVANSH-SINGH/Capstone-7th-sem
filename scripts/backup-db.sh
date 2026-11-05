#!/usr/bin/env bash
#
# Encrypted MongoDB backup for the single-service pilot.
#
# Usage:
#   export DB_URI='mongodb+srv://...'
#   export BACKUP_PASSPHRASE='...'   # keep this in a password manager
#   ./scripts/backup-db.sh [output-directory]
#
# The dump never touches disk in plaintext: mongodump streams a gzip archive
# into OpenSSL, which writes one encrypted file. The script then decrypts it
# back through gzip -t to prove the passphrase and archive are usable.
set -euo pipefail

: "${DB_URI:?Set DB_URI to the Atlas connection string.}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE to a strong passphrase.}"

if [ "${#BACKUP_PASSPHRASE}" -lt 16 ]; then
  echo "Refusing: BACKUP_PASSPHRASE must be at least 16 characters." >&2
  exit 1
fi

command -v mongodump >/dev/null 2>&1 || {
  echo "mongodump is missing. Install MongoDB Database Tools first:" >&2
  echo "  brew tap mongodb/brew && brew install mongodb-database-tools" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required." >&2
  exit 1
}

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/attendance-$STAMP.archive.gz.enc"

echo "Writing encrypted backup to $OUT"
mongodump --uri="$DB_URI" --archive --gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
      -pass env:BACKUP_PASSPHRASE \
      -out "$OUT"

# Verify that the file can be decrypted and that the decrypted stream is a
# valid gzip archive. No plaintext file is created.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_PASSPHRASE \
  -in "$OUT" \
  | gzip -t

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT" > "$OUT.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$OUT" > "$OUT.sha256"
fi

echo "Backup verified: $OUT"
ls -lh "$OUT" "$OUT.sha256" 2>/dev/null || true
