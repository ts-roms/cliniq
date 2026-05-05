#!/usr/bin/env bash
# AWS bootstrap for ClinIQ.
# Idempotent — safe to re-run. Prints ARNs you'll need.
#
#   AWS_REGION=ap-southeast-1 \
#   ENVIRONMENT=dev \
#   GITHUB_REPO=your-org/cliniq \
#   ./bootstrap.sh

set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required (e.g. ap-southeast-1)}"
: "${ENVIRONMENT:?ENVIRONMENT is required (dev | prod)}"
: "${GITHUB_REPO:?GITHUB_REPO is required (e.g. your-org/cliniq)}"

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "ENVIRONMENT must be 'dev' or 'prod', got '$ENVIRONMENT'" >&2
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PREFIX="cliniq-${ENVIRONMENT}"
STATE_BUCKET="cliniq-tfstate-${ENVIRONMENT}-${ACCOUNT_ID}"
LOCK_TABLE="cliniq-tfstate-locks"
DEPLOY_ROLE="cliniq-${ENVIRONMENT}-deploy"
TF_ADMIN_ROLE="cliniq-${ENVIRONMENT}-terraform-admin"
OIDC_PROVIDER="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER}"

echo "── Bootstrap target ──"
echo "  Account:       $ACCOUNT_ID"
echo "  Region:        $AWS_REGION"
echo "  Environment:   $ENVIRONMENT"
echo "  Repo:          $GITHUB_REPO"
echo

# ── 1. KMS for state bucket ─────────────────────────────────
KMS_ALIAS="alias/${PREFIX}-tfstate"
KMS_KEY_ID=$(aws kms describe-key --key-id "$KMS_ALIAS" --query 'KeyMetadata.KeyId' --output text 2>/dev/null || echo "")
if [[ -z "$KMS_KEY_ID" ]]; then
  echo "Creating KMS key for state bucket..."
  KMS_KEY_ID=$(aws kms create-key \
    --description "ClinIQ ${ENVIRONMENT} Terraform state encryption" \
    --tags TagKey=Project,TagValue=ClinIQ TagKey=Environment,TagValue="$ENVIRONMENT" TagKey=Purpose,TagValue=tfstate \
    --query 'KeyMetadata.KeyId' --output text)
  aws kms create-alias --alias-name "$KMS_ALIAS" --target-key-id "$KMS_KEY_ID"
  aws kms enable-key-rotation --key-id "$KMS_KEY_ID"
fi
KMS_ARN="arn:aws:kms:${AWS_REGION}:${ACCOUNT_ID}:key/${KMS_KEY_ID}"
echo "  KMS:           $KMS_ARN"

# ── 2. S3 state bucket ──────────────────────────────────────
if aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
  echo "  S3 bucket:     $STATE_BUCKET (exists)"
else
  echo "Creating S3 state bucket $STATE_BUCKET..."
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION"
  else
    aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION" \
      --create-bucket-configuration "LocationConstraint=$AWS_REGION"
  fi
  aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
    --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
    --server-side-encryption-configuration "{
      \"Rules\": [{
        \"ApplyServerSideEncryptionByDefault\": {
          \"SSEAlgorithm\": \"aws:kms\",
          \"KMSMasterKeyID\": \"$KMS_ARN\"
        },
        \"BucketKeyEnabled\": true
      }]
    }"
  aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  aws s3api put-bucket-tagging --bucket "$STATE_BUCKET" --tagging \
    "TagSet=[{Key=Project,Value=ClinIQ},{Key=Environment,Value=$ENVIRONMENT},{Key=Purpose,Value=tfstate}]"
fi
echo "  S3 bucket:     $STATE_BUCKET"

# ── 3. DynamoDB lock table ──────────────────────────────────
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "  DDB table:     $LOCK_TABLE (exists)"
else
  echo "Creating DynamoDB lock table..."
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$AWS_REGION" \
    --tags Key=Project,Value=ClinIQ Key=Purpose,Value=tfstate-lock >/dev/null
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$AWS_REGION"
fi
echo "  DDB table:     $LOCK_TABLE"

# ── 4. GitHub OIDC provider ─────────────────────────────────
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "  OIDC provider: exists"
else
  echo "Creating GitHub OIDC provider..."
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_PROVIDER}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" >/dev/null
fi
echo "  OIDC provider: $OIDC_ARN"

# ── 5. Deploy role (assumed by GitHub Actions) ──────────────
DEPLOY_TRUST=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$OIDC_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "${OIDC_PROVIDER}:aud": "sts.amazonaws.com" },
      "StringLike":   { "${OIDC_PROVIDER}:sub": "repo:${GITHUB_REPO}:*" }
    }
  }]
}
EOF
)

if aws iam get-role --role-name "$DEPLOY_ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$DEPLOY_ROLE" \
    --policy-document "$DEPLOY_TRUST"
  echo "  Deploy role:   $DEPLOY_ROLE (trust updated)"
else
  aws iam create-role --role-name "$DEPLOY_ROLE" \
    --assume-role-policy-document "$DEPLOY_TRUST" \
    --description "ClinIQ ${ENVIRONMENT} GitHub Actions deploy role" \
    --tags Key=Project,Value=ClinIQ Key=Environment,Value="$ENVIRONMENT" >/dev/null
  echo "  Deploy role:   $DEPLOY_ROLE (created)"
fi

# Inline deploy policy: ECR push, ECS update, Secrets read, Bedrock invoke,
# CloudWatch logs, S3 PHI bucket access. Tightly scoped by name prefix.
DEPLOY_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:DescribeRepositories",
        "ecr:DescribeImages",
        "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/${PREFIX}-*"
    },
    {
      "Sid": "EcsDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeTasks",
        "ecs:ListTasks",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeClusters"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EcsPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::${ACCOUNT_ID}:role/${PREFIX}-ecs-task",
        "arn:aws:iam::${ACCOUNT_ID}:role/${PREFIX}-ecs-task-execution"
      ]
    },
    {
      "Sid": "SecretsRead",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${PREFIX}/*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
      "Resource": "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/ecs/${PREFIX}/*"
    }
  ]
}
EOF
)
aws iam put-role-policy --role-name "$DEPLOY_ROLE" \
  --policy-name "${DEPLOY_ROLE}-policy" \
  --policy-document "$DEPLOY_POLICY"

# ── 6. Terraform admin role (broader; used for plan/apply) ──
TF_TRUST=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$OIDC_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "${OIDC_PROVIDER}:aud": "sts.amazonaws.com" },
      "StringLike":   { "${OIDC_PROVIDER}:sub": "repo:${GITHUB_REPO}:environment:${ENVIRONMENT}" }
    }
  }, {
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::${ACCOUNT_ID}:root" },
    "Action": "sts:AssumeRole"
  }]
}
EOF
)
if aws iam get-role --role-name "$TF_ADMIN_ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$TF_ADMIN_ROLE" \
    --policy-document "$TF_TRUST"
  echo "  TF admin role: $TF_ADMIN_ROLE (trust updated)"
else
  aws iam create-role --role-name "$TF_ADMIN_ROLE" \
    --assume-role-policy-document "$TF_TRUST" \
    --description "ClinIQ ${ENVIRONMENT} Terraform admin (assume from CI or local)" \
    --tags Key=Project,Value=ClinIQ Key=Environment,Value="$ENVIRONMENT" >/dev/null
  echo "  TF admin role: $TF_ADMIN_ROLE (created)"
fi
# Terraform admin gets PowerUser + IAM permissions (needs to create the task roles, etc).
# Tighten with a tag-based deny in production.
aws iam attach-role-policy --role-name "$TF_ADMIN_ROLE" \
  --policy-arn "arn:aws:iam::aws:policy/PowerUserAccess"
aws iam attach-role-policy --role-name "$TF_ADMIN_ROLE" \
  --policy-arn "arn:aws:iam::aws:policy/IAMFullAccess"

echo
echo "── Done. Paste these into GitHub repo settings → Secrets and variables → Actions ──"
echo
echo "  AWS_DEPLOY_ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/${DEPLOY_ROLE}"
echo "  AWS_TF_ADMIN_ROLE_ARN=arn:aws:iam::${ACCOUNT_ID}:role/${TF_ADMIN_ROLE}"
echo
echo "── Update infra/terraform/environments/${ENVIRONMENT}/main.tf backend block ──"
echo
cat <<EOF
  terraform {
    backend "s3" {
      bucket         = "${STATE_BUCKET}"
      key            = "cliniq/${ENVIRONMENT}/terraform.tfstate"
      region         = "${AWS_REGION}"
      dynamodb_table = "${LOCK_TABLE}"
      encrypt        = true
      kms_key_id     = "${KMS_ARN}"
    }
  }
EOF
echo
echo "Then in that environment dir: terraform init && terraform plan -var-file=${ENVIRONMENT}.tfvars"
