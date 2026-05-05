#!/usr/bin/env bash
# Teardown for the bootstrap resources. Run only after every environment's
# terraform destroy has completed.
#
#   AWS_REGION=ap-southeast-1 ENVIRONMENT=dev ./teardown.sh

set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ENVIRONMENT:?ENVIRONMENT is required}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PREFIX="cliniq-${ENVIRONMENT}"
STATE_BUCKET="cliniq-tfstate-${ENVIRONMENT}-${ACCOUNT_ID}"
LOCK_TABLE="cliniq-tfstate-locks"
DEPLOY_ROLE="cliniq-${ENVIRONMENT}-deploy"
TF_ADMIN_ROLE="cliniq-${ENVIRONMENT}-terraform-admin"
KMS_ALIAS="alias/${PREFIX}-tfstate"

read -rp "Tear down bootstrap for env=${ENVIRONMENT} in account ${ACCOUNT_ID}? (yes/no) " ans
[[ "$ans" == "yes" ]] || { echo "aborted"; exit 0; }

# Detach + delete IAM roles
for role in "$DEPLOY_ROLE" "$TF_ADMIN_ROLE"; do
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then
    echo "Removing policies from $role..."
    aws iam list-attached-role-policies --role-name "$role" \
      --query 'AttachedPolicies[].PolicyArn' --output text \
      | xargs -r -n1 aws iam detach-role-policy --role-name "$role" --policy-arn
    aws iam list-role-policies --role-name "$role" \
      --query 'PolicyNames' --output text \
      | xargs -r -n1 aws iam delete-role-policy --role-name "$role" --policy-name
    aws iam delete-role --role-name "$role"
    echo "  deleted $role"
  fi
done

# DynamoDB lock table — only delete if empty
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  ITEMS=$(aws dynamodb scan --table-name "$LOCK_TABLE" --select COUNT --region "$AWS_REGION" --query Count --output text)
  if [[ "$ITEMS" -gt 0 ]]; then
    echo "DDB lock table $LOCK_TABLE has $ITEMS items — refusing to delete"
  else
    aws dynamodb delete-table --table-name "$LOCK_TABLE" --region "$AWS_REGION" >/dev/null
    echo "  deleted $LOCK_TABLE"
  fi
fi

# S3 bucket — only if empty
if aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
  COUNT=$(aws s3api list-objects-v2 --bucket "$STATE_BUCKET" --query 'Contents | length(@)' --output text 2>/dev/null || echo 0)
  if [[ "$COUNT" != "None" && "$COUNT" -gt 0 ]]; then
    echo "S3 bucket $STATE_BUCKET has objects — refusing to delete (run 'aws s3 rm s3://$STATE_BUCKET --recursive' first)"
  else
    aws s3api delete-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION"
    echo "  deleted $STATE_BUCKET"
  fi
fi

# KMS — schedule for deletion (30 days, can be canceled)
if KEY_ID=$(aws kms describe-key --key-id "$KMS_ALIAS" --query 'KeyMetadata.KeyId' --output text 2>/dev/null); then
  aws kms delete-alias --alias-name "$KMS_ALIAS"
  aws kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 30 >/dev/null
  echo "  KMS key scheduled for deletion in 30 days"
fi

echo "Done."
