#!/usr/bin/env bash
# Nightly logical backup: pg_dump -> gzip -> encrypt -> upload to S3.
# Run via the backup.yml GitHub Actions schedule, or any cron with these
# env vars set: DATABASE_URL, BACKUP_ENCRYPTION_KEY, S3_BACKUP_BUCKET,
# AWS credentials (or S3-compatible equivalents — reuses the same
# S3_ACCESS_KEY/S3_SECRET_KEY/S3_ENDPOINT as product image storage).
set -euo pipefail

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE="ai_commerce_${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.enc"

: "${DATABASE_URL:?DATABASE_URL not set}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set — generate with: openssl rand -hex 32}"
: "${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET not set}"

echo "Dumping database..."
# -Fc (custom format) is required for pg_restore's selective/parallel restore
# below — a plain SQL dump can't do either.
pg_dump "$DATABASE_URL" -Fc -f "$DUMP_FILE"

echo "Encrypting..."
# Backups contain full customer PII (addresses, emails) and order history —
# they need to be encrypted at rest wherever they're stored, same standard
# as the primary database, not a lesser one just because it's "just a backup".
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$DUMP_FILE" -out "$ENCRYPTED_FILE" \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}"
rm "$DUMP_FILE"

echo "Uploading to s3://${S3_BACKUP_BUCKET}/..."
aws s3 cp "$ENCRYPTED_FILE" "s3://${S3_BACKUP_BUCKET}/${ENCRYPTED_FILE}" \
  ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
rm "$ENCRYPTED_FILE"

echo "Pruning backups older than 30 days..."
CUTOFF=$(date -u -d '30 days ago' +%Y%m%d 2>/dev/null || date -u -v-30d +%Y%m%d)
aws s3 ls "s3://${S3_BACKUP_BUCKET}/" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} \
  | awk '{print $4}' \
  | grep '^ai_commerce_' \
  | while read -r name; do
      file_date=$(echo "$name" | sed -E 's/ai_commerce_([0-9]{8})T.*/\1/')
      if [[ "$file_date" < "$CUTOFF" ]]; then
        aws s3 rm "s3://${S3_BACKUP_BUCKET}/${name}" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
        echo "  pruned $name"
      fi
    done

echo "Backup complete: ${ENCRYPTED_FILE}"
