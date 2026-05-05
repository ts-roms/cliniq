# ClinIQ — production environment
# Multi-AZ, NAT per AZ, larger RDS, deletion protection, longer log retention, Object Lock.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }

  # backend "s3" {
  #   bucket         = "cliniq-tfstate-prod"
  #   key            = "cliniq/prod/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "cliniq-tfstate-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.common_tags }
}

locals {
  name = "cliniq-prod"
  common_tags = {
    Project     = "ClinIQ"
    Environment = "prod"
    CostCenter  = "engineering"
    ManagedBy   = "terraform"
  }
}

module "network" {
  source     = "../../modules/network"
  name       = local.name
  cidr_block = "10.50.0.0/16"
  az_count   = 3
  single_nat = false
  tags       = local.common_tags
}

module "storage" {
  source             = "../../modules/storage"
  name               = local.name
  production         = true
  enable_object_lock = true # PHI bucket has Object Lock enabled at create time
  tags               = local.common_tags
}

module "database" {
  source                = "../../modules/database"
  name                  = local.name
  subnet_ids            = module.network.private_subnet_ids
  security_group_id     = module.network.rds_security_group_id
  instance_class        = "db.r7g.large"
  allocated_storage_gb  = 100
  max_allocated_storage_gb = 500
  multi_az              = true
  backup_retention_days = 30
  deletion_protection   = true
  log_statements        = false
  tags                  = local.common_tags
}

module "ai_bedrock" {
  source = "../../modules/ai-bedrock"
  name   = local.name
  tags   = local.common_tags
}

resource "aws_secretsmanager_secret" "jwt" {
  name        = "${local.name}/jwt-secret"
  description = "JWT signing secret for ClinIQ prod"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = jsonencode({ JWT_SECRET = "ROTATE_VIA_CLI_THIS_IS_PLACEHOLDER" })
  lifecycle { ignore_changes = [secret_string] } # rotate via CLI, not Terraform
}

module "compute" {
  source                       = "../../modules/compute"
  name                         = local.name
  production                   = true
  vpc_id                       = module.network.vpc_id
  public_subnet_ids            = module.network.public_subnet_ids
  private_subnet_ids           = module.network.private_subnet_ids
  alb_security_group_id        = module.network.alb_security_group_id
  ecs_tasks_security_group_id  = module.network.ecs_tasks_security_group_id

  acm_certificate_arn = var.acm_certificate_arn
  api_image           = var.api_image
  api_cpu             = 1024
  api_memory          = 2048
  api_desired_count   = 2
  log_retention_days  = 90

  secret_arns = [
    module.database.secret_arn,
    aws_secretsmanager_secret.jwt.arn,
  ]
  kms_key_arns = [
    module.database.kms_key_arn,
    module.storage.phi_kms_key_arn,
  ]
  phi_bucket_arns    = [module.storage.phi_bucket_arn]
  bedrock_policy_arn = module.ai_bedrock.policy_arn

  env_secret_arns = {
    DATABASE_URL = "${module.database.secret_arn}:DATABASE_URL::"
    JWT_SECRET   = "${aws_secretsmanager_secret.jwt.arn}:JWT_SECRET::"
  }

  tags = local.common_tags
}
