#!/usr/bin/env bash
# Restores a backup produced by backup-db.sh into a target database.
# NEVER run this against a production DATABASE_URL without triple-checking
# — it drops and recreates the target schema.
#
# Usage: ./restore-db.sh <backup-filename.dump.enc> <target-database-url>
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore-db.sh <backup-filename> <target-database-url>}"
TARGET_DB="${2:?Usage: restore-db.sh <backup-filename> <target-database-url>}"

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set}"
: "${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET not set}"

echo "This will DROP and recreate all tables in:"
echo "  $TARGET_DB"
read -p "Type the database name to confirm: " confirmation
DB_NAME=$(echo "$TARGET_DB" | sed -E 's#.*/([^/?]+).*#\1#')
if [[ "$confirmation" != "$DB_NAME" ]]; then
  echo "Confirmation did not match database name ($DB_NAME). Aborting."
  exit 1
fi

echo "Downloading $BACKUP_FILE..."
aws s3 cp "s3://${S3_BACKUP_BUCKET}/${BACKUP_FILE}" "./${BACKUP_FILE}" \
  ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}

echo "Decrypting..."
DECRYPTED_FILE="${BACKUP_FILE%.enc}"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$BACKUP_FILE" -out "$DECRYPTED_FILE" \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}"

echo "Restoring into $TARGET_DB..."
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$TARGET_DB" "$DECRYPTED_FILE"

rm "$BACKUP_FILE" "$DECRYPTED_FILE"
echo "Restore complete. Verify with: psql \"$TARGET_DB\" -c 'SELECT count(*) FROM \"Order\";'"
