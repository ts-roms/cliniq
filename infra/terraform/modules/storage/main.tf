# S3 buckets + KMS keys for ClinIQ.
# - PHI bucket: KMS-encrypted, public access blocked, versioned, lifecycle to Intelligent-Tiering, optional Object Lock.
# - Public bucket: for clinic logos, marketing assets. CloudFront-fronted later.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

# ─── KMS ────────────────────────────────────────

resource "aws_kms_key" "phi" {
  description             = "ClinIQ PHI bucket encryption (${var.name})"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = merge(var.tags, { Name = "${var.name}-phi-kms", Classification = "phi" })
}

resource "aws_kms_alias" "phi" {
  name          = "alias/${var.name}-phi"
  target_key_id = aws_kms_key.phi.key_id
}

# ─── PHI bucket ─────────────────────────────────

resource "aws_s3_bucket" "phi" {
  bucket        = "${var.name}-phi"
  force_destroy = !var.production
  tags          = merge(var.tags, { Name = "${var.name}-phi", Classification = "phi" })

  # Object Lock requires it be enabled at create time
  object_lock_enabled = var.enable_object_lock
}

resource "aws_s3_bucket_versioning" "phi" {
  bucket = aws_s3_bucket.phi.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "phi" {
  bucket = aws_s3_bucket.phi.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.phi.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "phi" {
  bucket                  = aws_s3_bucket.phi.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "phi" {
  bucket = aws_s3_bucket.phi.id

  rule {
    id     = "transition-to-intelligent-tiering"
    status = "Enabled"
    filter {}
    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }
  }

  rule {
    id     = "expire-derm-audio-after-90d"
    status = "Enabled"
    filter { prefix = "derm/audio/" }
    expiration { days = 90 }
  }

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

# Logging bucket for PHI access
resource "aws_s3_bucket" "phi_logs" {
  bucket        = "${var.name}-phi-logs"
  force_destroy = !var.production
  tags          = merge(var.tags, { Name = "${var.name}-phi-logs" })
}

resource "aws_s3_bucket_public_access_block" "phi_logs" {
  bucket                  = aws_s3_bucket.phi_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "phi" {
  bucket        = aws_s3_bucket.phi.id
  target_bucket = aws_s3_bucket.phi_logs.id
  target_prefix = "phi-access/"
}

# ─── Public bucket ──────────────────────────────

resource "aws_s3_bucket" "public" {
  bucket        = "${var.name}-public"
  force_destroy = !var.production
  tags          = merge(var.tags, { Name = "${var.name}-public" })
}

resource "aws_s3_bucket_versioning" "public" {
  bucket = aws_s3_bucket.public.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "public" {
  bucket = aws_s3_bucket.public.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "public" {
  bucket                  = aws_s3_bucket.public.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
