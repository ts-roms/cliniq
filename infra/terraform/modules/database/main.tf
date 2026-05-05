# RDS Postgres for ClinIQ. KMS-encrypted, in private subnets, password in Secrets Manager.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.70" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "_-"
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnets"
  subnet_ids = var.subnet_ids
  tags       = merge(var.tags, { Name = "${var.name}-db-subnets" })
}

resource "aws_kms_key" "rds" {
  description             = "Encryption key for ClinIQ RDS (${var.name})"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = merge(var.tags, { Name = "${var.name}-rds-kms" })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg16"
  family = "postgres16"

  # Security + perf defaults; expand as needed
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_statement"
    value = var.log_statements ? "all" : "ddl"
  }
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "this" {
  identifier              = "${var.name}-postgres"
  engine                  = "postgres"
  engine_version          = "16.6"
  instance_class          = var.instance_class
  allocated_storage       = var.allocated_storage_gb
  max_allocated_storage   = var.max_allocated_storage_gb
  storage_type            = "gp3"
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.rds.arn
  db_name                 = "cliniq"
  username                = "cliniq_admin"
  password                = random_password.db.result
  port                    = 5432
  multi_az                = var.multi_az
  publicly_accessible     = false
  db_subnet_group_name    = aws_db_subnet_group.this.name
  vpc_security_group_ids  = [var.security_group_id]
  parameter_group_name    = aws_db_parameter_group.this.name
  backup_retention_period = var.backup_retention_days
  backup_window           = "17:00-18:00" # 1AM-2AM Manila
  maintenance_window      = "Sun:18:00-Sun:19:30"
  copy_tags_to_snapshot   = true
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${var.name}-final-${formatdate("YYYYMMDDhhmmss", timestamp())}" : null
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  monitoring_interval             = 60
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  apply_immediately               = false
  auto_minor_version_upgrade      = true

  tags = merge(var.tags, { Name = "${var.name}-postgres" })

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

# Store the DATABASE_URL in Secrets Manager for the app to read
resource "aws_secretsmanager_secret" "database_url" {
  name        = "${var.name}/database-url"
  description = "Postgres connection string for ClinIQ ${var.name}"
  kms_key_id  = aws_kms_key.rds.arn
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = jsonencode({
    DATABASE_URL = "postgresql://${aws_db_instance.this.username}:${random_password.db.result}@${aws_db_instance.this.endpoint}/${aws_db_instance.this.db_name}?schema=public&sslmode=require"
    APP_USER     = "cliniq_app"
    HOST         = aws_db_instance.this.address
    PORT         = aws_db_instance.this.port
  })
}
