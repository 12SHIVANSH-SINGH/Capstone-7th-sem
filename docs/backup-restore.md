# Backup and restore drill

Atlas M0 has **no automated backups**. The encrypted dump is the recovery path for a bad
migration, an accidental delete or a compromised database account. It is not optional before a
pilot.

The restore drill is suite **RS** in [`testing-plan.md`](testing-plan.md). It is conditional
on gate **G5**: the Atlas URI, backup passphrase, `mongodump`/`mongorestore` and
scratch-database permission must all be available. If any prerequisite is missing, record the
suite **BLOCKED**; do not describe the restore as tested.

## What you need

- `mongodump` and `mongorestore` from MongoDB Database Tools:
  ```bash
  brew tap mongodb/brew
  brew install mongodb-database-tools
  ```
- `openssl` (already on macOS).
- Your Atlas `DB_URI`.
- A passphrase of at least 16 characters, stored in a password manager. Do not put it in the
  repository, `config.env`, Render or a shell history file.

Generate a passphrase if needed:

```bash
openssl rand -base64 32
```

## Take a backup

```bash
export DB_URI='mongodb+srv://...'
export BACKUP_PASSPHRASE='...'
./scripts/backup-db.sh
```

The script streams `mongodump` through AES-256-CBC with PBKDF2 (200,000 iterations) and writes one
encrypted file under `backups/`. It then decrypts the file through `gzip -t` to verify the
passphrase and archive integrity. No plaintext dump is written. The sidecar `.sha256` detects
corruption; it is not a keyed signature, so an attacker who can rewrite the backup can also
rewrite the checksum. Protect the backup storage account as carefully as the database.

Take a backup:

- before every production deploy;
- weekly while the pilot is active;
- before any migration or bulk roster change.

Keep at least seven daily and four weekly encrypted copies. Store one copy off the machine that
runs the backup. The `backups/` directory and encrypted archive patterns are gitignored, but an
encrypted dump still contains student PII: treat it like the database.

## Restore drill

Use a **fresh scratch database**, never production. The script refuses to restore when
`RESTORE_DB` equals `SOURCE_DB` or does not contain `_restore_`/`_drill_`.

```bash
export DB_URI='mongodb+srv://...'
export BACKUP_PASSPHRASE='...'
export BACKUP_FILE='backups/attendance-20261105T120000Z.archive.gz.enc'
export SOURCE_DB='attendance'
export RESTORE_DB='attendance_restore_20261105'
./scripts/restore-db.sh
```

Verify the important collections before deleting the scratch database. Use `mongosh` if it is
installed, or the Atlas Data Explorer:

```javascript
const source = db.getSiblingDB("attendance");
const restored = db.getSiblingDB("attendance_restore_20261105");
for (const name of source.getCollectionNames().sort()) {
  print(name, source.getCollection(name).countDocuments(), restored.getCollection(name).countDocuments());
}
```

Acceptance for the drill:

1. `users`, `courseclasses`, `enrollments`, `checkinsessions`, `attendancerecords`,
   `attendancequeries`, `timetables` and `auditlogs` counts match.
2. One known student and one known class can be read from the restored database.
3. The scratch database is deleted.
4. The date, backup file name, passphrase location and result are recorded in an operator log
   (never the passphrase itself).

## What not to do

- Do not restore directly over `attendance`.
- Do not write a decrypted archive to disk.
- Do not commit `backups/`.
- Do not reuse a backup passphrase for anything else.
- Do not assume the dump is good without the `gzip -t` check and a restore drill.

## Current status

The scripts and this runbook are in place. The encryption/decryption pipeline has been exercised
with stub `mongodump`/`mongorestore` binaries: the encrypted file passes the decrypt-and-gzip
check, the restore arguments map `attendance.*` to a scratch database, and a wrong passphrase is
rejected. That proves the script plumbing, not MongoDB restore correctness.

The first real backup and restore drill still needs the Atlas URI, the passphrase and MongoDB
Database Tools installed on the operator machine. The deployed test plan
([`testing-plan.md`](testing-plan.md), suite RS) is the execution script; it marks the suite
**BLOCKED** when gate G5 fails. Record the result in `progress.md` after the drill.
