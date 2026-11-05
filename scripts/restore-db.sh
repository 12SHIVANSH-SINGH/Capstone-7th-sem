#!/usr/bin/env bash
#
# Restore an encrypted backup into a scratch database for a drill.
#
# This script deliberately refuses to restore over the source database. Use a
# name containing "_restore_" (for example bioattend_restore_20261105) and a
# fresh database. Never point this at production.
#
# Usage:
#   export DB_URI='mongodb+srv://...'
#   export BACKUP_PASSPHRASE='...'
#   export BACKUP_FILE='backups/bioattend-....archive.gz.enc'
#   export SOURCE_DB='attendance'
#   export RESTORE_DB='attendance_restore_20261105'
#   ./scripts/restore-db.sh
set -euo pipefail

: "${DB_URI:?Set DB_URI to the Atlas connection string.}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE.}"
: "${BACKUP_FILE:?Set BACKUP_FILE to the encrypted archive.}"
: "${RESTORE_DB:?Set RESTORE_DB to a fresh scratch database name.}"
SOURCE_DB="${SOURCE_DB:-attendance}"

if [ "$RESTORE_DB" = "$SOURCE_DB" ]; then
  echo "Refusing: RESTORE_DB must not equal SOURCE_DB." >&2
  exit 1
fi
if [[ "$RESTORE_DB" != *"_restore_"* && "$RESTORE_DB" != *"_drill_"* ]]; then
  echo "Refusing: RESTORE_DB must contain _restore_ or _drill_ so it is clearly a scratch database." >&2
  exit 1
fi
[ -f "$BACKUP_FILE" ] || {
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
}

command -v mongorestore >/dev/null 2>&1 || {
  echo "mongorestore is missing. Install MongoDB Database Tools first:" >&2
  echo "  brew tap mongodb/brew && brew install mongodb-database-tools" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required." >&2
  exit 1
}

echo "Restoring $SOURCE_DB.* into scratch database $RESTORE_DB"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_PASSPHRASE \
  -in "$BACKUP_FILE" \
  | mongorestore --uri="$DB_URI" --archive --gzip \
      --nsFrom="${SOURCE_DB}.*" \
      --nsTo="${RESTORE_DB}.*"

echo "Restore finished. Verify collection counts before deleting the scratch database."
echo "Suggested check:"
echo "  mongosh \"\$DB_URI\" --eval 'db.getSiblingDB(\"$SOURCE_DB\").getCollectionNames().sort().map(c => [c, db.getSiblingDB(\"$SOURCE_DB\").getCollection(c).countDocuments(), db.getSiblingDB(\"$RESTORE_DB\").getCollection(c).countDocuments()])'"
