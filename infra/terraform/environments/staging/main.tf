terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  backend "s3" {
    bucket         = "ai-commerce-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "ai-commerce-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
}

module "network" {
  source      = "../../modules/network"
  environment = "staging"
}

module "eks" {
  source             = "../../modules/eks"
  environment        = "staging"
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  public_subnet_ids  = module.network.public_subnet_ids
  min_nodes          = 1
  max_nodes          = 4
  desired_nodes      = 2
}

module "database" {
  source                = "../../modules/database"
  environment           = "staging"
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  app_security_group_id = module.eks.cluster_security_group_id
  instance_class         = "db.t4g.micro"
  multi_az                = false
}

module "cache" {
  source                = "../../modules/cache"
  environment           = "staging"
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  app_security_group_id = module.eks.cluster_security_group_id
  multi_az                = false
}

module "storage" {
  source      = "../../modules/storage"
  environment = "staging"
}

output "eks_cluster_name" { value = module.eks.cluster_name }
output "rds_endpoint" { value = module.database.endpoint }
output "redis_endpoint" { value = module.cache.primary_endpoint }
