variable "enabled" {
  type        = bool
  default     = false
  description = "Off by default. See infra/terraform/README.md for why single-region is the right call until there's a concrete reason to pay for a second one."
}

variable "primary_db_arn" { type = string }
variable "primary_bucket_name" { type = string }

variable "dr_region" {
  type    = string
  default = "ap-south-1" # Mumbai — second-closest AWS region to Bangladesh after Singapore
}

# Cross-region READ REPLICA, not a second primary — this is disaster
# recovery (promote if the primary region has a prolonged outage), not
# active-active multi-region (serving live traffic from both regions
# simultaneously). Active-active needs conflict resolution for concurrent
# writes to the same rows from two regions — a much bigger design problem
# that isn't justified by anything this store's traffic profile needs yet.
resource "aws_db_instance" "dr_replica" {
  count = var.enabled ? 1 : 0

  provider            = aws.dr
  replicate_source_db = var.primary_db_arn
  instance_class      = "db.t4g.medium"
  skip_final_snapshot = true

  tags = { Name = "ai-commerce-dr-replica", Purpose = "disaster-recovery" }
}

resource "aws_s3_bucket" "dr_replica_bucket" {
  count    = var.enabled ? 1 : 0
  provider = aws.dr
  bucket   = "ai-commerce-dr-${var.dr_region}"
}

resource "aws_s3_bucket_versioning" "dr_replica_bucket" {
  count    = var.enabled ? 1 : 0
  provider = aws.dr
  bucket   = aws_s3_bucket.dr_replica_bucket[0].id
  versioning_configuration { status = "Enabled" } # required for cross-region replication
}

output "dr_replica_endpoint" {
  value = var.enabled ? aws_db_instance.dr_replica[0].endpoint : null
}
