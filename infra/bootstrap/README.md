# AWS Bootstrap

Run **once per AWS account**, before any Terraform `apply` or any GitHub Actions deploy. Creates the long-lived primitives that Terraform itself needs:

1. **S3 bucket** — Terraform remote state (versioned + KMS-encrypted, public-blocked)
2. **DynamoDB table** — Terraform state lock
3. **GitHub OIDC provider** — lets Actions assume IAM roles without long-lived keys
4. **`cliniq-deploy-<env>` IAM role** — assumed by GitHub Actions for ECR push, ECS deploy, Secrets Manager read, Bedrock invoke
5. **`terraform-admin` IAM role** — assumed for `terraform plan/apply` from local + workflow_dispatch

Two implementations — pick one:

| File | Use when |
|---|---|
| `bootstrap.sh` | One-shot AWS CLI script. No state. Re-runnable (idempotent). |
| `bootstrap.tf` | Terraform module that owns the bootstrap. Use if you want IaC for everything (chicken-and-egg solved with local state for this stack only). |

The shell script is faster to read and reason about; the Terraform module is what mature teams settle on. Both produce identical resources.

## Prerequisites

- AWS CLI v2 logged in as a user with `AdministratorAccess` (or sufficient perms to create IAM, S3, DynamoDB resources)
- `jq` installed (the shell script uses it for parsing AWS responses)
- Your GitHub org + repo name handy (for OIDC trust policy)

## Usage

```bash
cd infra/bootstrap

# Set required env vars
export AWS_REGION=ap-southeast-1
export ENVIRONMENT=dev          # or prod
export GITHUB_REPO="your-org/cliniq"

./bootstrap.sh
```

The script prints the ARNs you need to paste into:
- GitHub repo Secrets → `AWS_DEPLOY_ROLE_ARN`
- `infra/terraform/environments/<env>/main.tf` (uncomment the `backend "s3"` stanza with the printed bucket name)

## What it does NOT do

- Issue ACM certificates (do this manually after registering the domain — needs DNS verification)
- Provision the actual app infra — that's `infra/terraform/environments/<env>` which uses the state backend created here
- Create human-user IAM accounts — use AWS SSO / IAM Identity Center for that, not bootstrap scripts

## Tearing down

```bash
./teardown.sh    # asks for confirmation; skips S3 bucket if it has objects
```

`teardown.sh` will refuse to delete the state bucket if it contains state files. Empty Terraform state first (`terraform destroy` in each environment) before tearing down the bootstrap.
