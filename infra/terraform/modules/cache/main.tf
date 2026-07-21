variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }

variable "node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "multi_az" {
  type    = bool
  default = false
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "ai-commerce-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "redis" {
  name_prefix = "ai-commerce-${var.environment}-redis-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

# Replication group, not a single cache cluster — even at 1 node this gets
# automatic failover wired up for free once multi_az is flipped on, rather
# than a separate migration later.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "ai-commerce-${var.environment}"
  description                 = "AI Commerce ${var.environment} Redis"
  engine                      = "redis"
  engine_version               = "7.1"
  node_type                    = var.node_type
  num_cache_clusters            = var.multi_az ? 2 : 1
  automatic_failover_enabled   = var.multi_az
  multi_az_enabled             = var.multi_az

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = { Name = "ai-commerce-${var.environment}" }
}

output "primary_endpoint" { value = aws_elasticache_replication_group.main.primary_endpoint_address }
output "security_group_id" { value = aws_security_group.redis.id }
