variable "environment" { type = string }

resource "aws_s3_bucket" "product_images" {
  bucket = "ai-commerce-${var.environment}-product-images"
}

resource "aws_s3_bucket_public_access_block" "product_images" {
  bucket                  = aws_s3_bucket.product_images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
  # Public access happens through CloudFront + presigned URLs (see
  # StorageService.getUploadUrl in the api), never a public bucket policy.
}

resource "aws_s3_bucket_server_side_encryption_configuration" "product_images" {
  bucket = aws_s3_bucket.product_images.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket" "db_backups" {
  bucket = "ai-commerce-${var.environment}-db-backups"
}

resource "aws_s3_bucket_public_access_block" "db_backups" {
  bucket                  = aws_s3_bucket.db_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  versioning_configuration { status = "Enabled" }
  # Versioning on the backup bucket specifically: backup-db.sh already
  # encrypts client-side before upload (see the openssl step), but
  # versioning protects against an accidental overwrite/delete of a backup
  # object itself — a different failure mode than the DB backup existing.
}

resource "aws_s3_bucket_lifecycle_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    expiration { days = 90 } # backup-db.sh already prunes at 30 days from its own listing; this is a backstop in case that script stops running
  }
}

output "product_images_bucket" { value = aws_s3_bucket.product_images.bucket }
output "db_backups_bucket" { value = aws_s3_bucket.db_backups.bucket }
