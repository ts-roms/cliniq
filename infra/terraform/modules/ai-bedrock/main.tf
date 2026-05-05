# IAM policy for Bedrock InvokeModel scoped to specific Anthropic models.
# Attach this policy ARN to the ECS task role of the api / ai-service.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  region     = data.aws_region.current.name
  account_id = data.aws_caller_identity.current.account_id

  default_model_ids = [
    "anthropic.claude-sonnet-4-6-20260101-v1:0",
    "anthropic.claude-haiku-4-5-20251001-v1:0",
  ]

  model_ids   = length(var.model_ids) > 0 ? var.model_ids : local.default_model_ids
  model_arns  = [for m in local.model_ids : "arn:aws:bedrock:${local.region}::foundation-model/${m}"]
  inference_profile_arns = [
    for m in local.model_ids : "arn:aws:bedrock:${local.region}:${local.account_id}:inference-profile/*"
  ]
}

resource "aws_iam_policy" "bedrock_invoke" {
  name        = "${var.name}-bedrock-invoke"
  description = "Invoke Anthropic models on Bedrock for ClinIQ"
  tags        = var.tags

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvokeFoundationModels"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = local.model_arns
      },
      {
        Sid      = "InvokeViaInferenceProfiles"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = local.inference_profile_arns
      },
      {
        Sid    = "ListModels"
        Effect = "Allow"
        Action = [
          "bedrock:ListFoundationModels",
          "bedrock:GetFoundationModel",
          "bedrock:ListInferenceProfiles",
          "bedrock:GetInferenceProfile",
        ]
        Resource = "*"
      },
    ]
  })
}
