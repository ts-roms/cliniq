# ClinIQ — dev environment
# Cheap, single-AZ-ish, single NAT, t4g.micro RDS. Sized for ~$80/mo idle.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }

  # Uncomment + create the bucket/lock table once before first apply.
  # backend "s3" {
  #   bucket         = "cliniq-tfstate-dev"
  #   key            = "cliniq/dev/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "cliniq-tfstate-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

locals {
  name = "cliniq-dev"
  common_tags = {
    Project     = "ClinIQ"
    Environment = "dev"
    CostCenter  = "engineering"
    ManagedBy   = "terraform"
  }
}

module "network" {
  source     = "../../modules/network"
  name       = local.name
  cidr_block = "10.40.0.0/16"
  az_count   = 2
  single_nat = true
  tags       = local.common_tags
}

module "storage" {
  source             = "../../modules/storage"
  name               = local.name
  production         = false
  enable_object_lock = false
  tags               = local.common_tags
}

module "database" {
  source                = "../../modules/database"
  name                  = local.name
  subnet_ids            = module.network.private_subnet_ids
  security_group_id     = module.network.rds_security_group_id
  instance_class        = "db.t4g.micro"
  allocated_storage_gb  = 20
  multi_az              = false
  backup_retention_days = 3
  deletion_protection   = false
  log_statements        = false
  tags                  = local.common_tags
}

module "ai_bedrock" {
  source = "../../modules/ai-bedrock"
  name   = local.name
  tags   = local.common_tags
}

# Placeholder JWT secret (rotate via console / CLI for real env)
resource "aws_secretsmanager_secret" "jwt" {
  name        = "${local.name}/jwt-secret"
  description = "JWT signing secret for ClinIQ dev"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = jsonencode({ JWT_SECRET = "REPLACE_ME_VIA_CLI_AFTER_APPLY" })
}

module "compute" {
  source                       = "../../modules/compute"
  name                         = local.name
  production                   = false
  vpc_id                       = module.network.vpc_id
  public_subnet_ids            = module.network.public_subnet_ids
  private_subnet_ids           = module.network.private_subnet_ids
  alb_security_group_id        = module.network.alb_security_group_id
  ecs_tasks_security_group_id  = module.network.ecs_tasks_security_group_id

  acm_certificate_arn = var.acm_certificate_arn
  api_image           = var.api_image
  api_cpu             = 512
  api_memory          = 1024
  api_desired_count   = 1
  log_retention_days  = 14

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
