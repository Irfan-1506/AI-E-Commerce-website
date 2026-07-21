variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }

variable "instance_class" {
  type    = string
  default = "db.t4g.medium" # ARM (Graviton) — better price/performance than x86 equivalents for this workload
}

variable "multi_az" {
  type    = bool
  default = false # true in the production tfvars — see environments/production
}

resource "aws_db_subnet_group" "main" {
  name       = "ai-commerce-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "rds" {
  name_prefix = "ai-commerce-${var.environment}-rds-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
    # Only the app's own security group, not 0.0.0.0/0 — the network-layer
    # equivalent of setup-db-roles.sql's least-privilege instinct.
  }
}

resource "aws_db_instance" "main" {
  identifier     = "ai-commerce-${var.environment}"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.instance_class

  allocated_storage     = 50
  max_allocated_storage = 200 # storage autoscaling — avoids a 3am page for "disk full" on a slow, predictable growth curve
  storage_encrypted     = true

  db_name                     = "ai_commerce"
  username                    = "ai_commerce_migrator" # matches scripts/setup-db-roles.sql — this is the schema-owning credential, not the app's runtime one
  manage_master_user_password = true # RDS-managed, rotated automatically via Secrets Manager — no password in this file or state in plaintext

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az                = var.multi_az

  backup_retention_period   = 30
  backup_window              = "17:00-18:00" # UTC — matches backup.yml's 18:00 UTC schedule
  deletion_protection        = var.environment == "production"
  skip_final_snapshot        = var.environment != "production"
  final_snapshot_identifier  = var.environment == "production" ? "ai-commerce-production-final" : null

  # pgvector ships with RDS Postgres 16+ as an available extension — CREATE
  # EXTENSION vector still needs to run post-provisioning (scripts/enable-
  # vector.sql); Terraform doesn't run SQL against the DB it just created.

  tags = { Name = "ai-commerce-${var.environment}" }
}

output "endpoint" { value = aws_db_instance.main.endpoint }
output "security_group_id" { value = aws_security_group.rds.id }
