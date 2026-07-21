terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  # S3 backend for state — bucket/table must exist before `terraform init`
  # works. Bootstrap once by hand: an S3 bucket with versioning + a
  # DynamoDB table for the lock, then this backend config takes over.
  backend "s3" {
    bucket         = "ai-commerce-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "ai-commerce-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
}

provider "aws" {
  alias  = "dr"
  region = "ap-south-1"
}

module "network" {
  source      = "../../modules/network"
  environment = "production"
}

module "eks" {
  source             = "../../modules/eks"
  environment        = "production"
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  public_subnet_ids  = module.network.public_subnet_ids
  min_nodes          = 3
  max_nodes          = 15
  desired_nodes      = 3
}

module "database" {
  source                 = "../../modules/database"
  environment            = "production"
  vpc_id                 = module.network.vpc_id
  private_subnet_ids     = module.network.private_subnet_ids
  app_security_group_id  = module.eks.cluster_security_group_id
  multi_az               = true
}

module "cache" {
  source                 = "../../modules/cache"
  environment            = "production"
  vpc_id                 = module.network.vpc_id
  private_subnet_ids     = module.network.private_subnet_ids
  app_security_group_id  = module.eks.cluster_security_group_id
  multi_az               = true
}

module "storage" {
  source      = "../../modules/storage"
  environment = "production"
}

# Disabled by default — see modules/dr-region/main.tf and
# infra/terraform/README.md. Flip enabled=true only with a specific
# RTO/RPO requirement driving the decision, not by default.
module "dr_region" {
  source              = "../../modules/dr-region"
  enabled             = false
  primary_db_arn      = ""
  primary_bucket_name = module.storage.db_backups_bucket
  providers           = { aws.dr = aws.dr }
}

output "eks_cluster_name" { value = module.eks.cluster_name }
output "rds_endpoint" { value = module.database.endpoint }
output "redis_endpoint" { value = module.cache.primary_endpoint }
