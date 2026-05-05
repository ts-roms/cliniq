# ClinIQ — Terraform Infrastructure

> Infrastructure-as-Code for ClinIQ AWS deployments. PH region by default (`ap-southeast-1`).
> See `docs/01-architecture.md` for the topology this provisions.

---

## Layout

```
infra/terraform/
├── modules/                Reusable building blocks
│   ├── network/            VPC, subnets, NAT, security groups
│   ├── database/           RDS Postgres + Secrets Manager binding
│   ├── compute/            ECS Fargate cluster + ALB + service
│   ├── storage/            S3 buckets (PHI + public) + KMS
│   ├── ai-bedrock/         Bedrock IAM role + model access policy
│   └── secrets/            Secrets Manager wrappers
└── environments/
    ├── dev/                Smaller / cheaper / single-AZ
    └── prod/               Multi-AZ, larger instances, stricter
```

## Prerequisites

- Terraform ≥ 1.9
- AWS CLI ≥ 2.x configured with a profile that can manage IAM, EC2, RDS, ECS, S3, KMS, Bedrock
- Per-environment S3 backend bucket + DynamoDB lock table (created out of band — see `bootstrap.sh` notes)

## Usage

```bash
cd infra/terraform/environments/dev
terraform init
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

## What ships in v1 (the skeleton)

- VPC with public + private subnets across 2 AZs (dev) / 3 AZs (prod)
- NAT (1 in dev for cost; 1 per AZ in prod)
- RDS Postgres 16 (db.t4g.micro dev / db.r7g.large prod), encrypted, in private subnets
- ECS Fargate cluster with one placeholder service (the api)
- ALB in public subnets routing `/api/*` to the api task
- S3 buckets: `cliniq-phi-{env}` (KMS-encrypted, blocked public) + `cliniq-public-{env}` (CDN-fronted later)
- KMS keys: one per data-classification tier (PHI, app secrets, logs)
- IAM role for ECS tasks with **Bedrock InvokeModel** permission scoped to specific model ARNs
- Secrets Manager entries: `DATABASE_URL`, `JWT_SECRET`, model overrides
- CloudWatch log groups for ECS services
- Route 53 hosted zone hooks (commented — uncomment when domain is registered)

## NOT in v1 (open as TODO comments)

- CloudFront + WAF + Shield (front for ALB and S3-public)
- Aurora Serverless v2 (upgrade path from RDS)
- Multi-region replicas (when expanding beyond PH)
- ElastiCache Redis cluster
- Meilisearch on Fargate
- Telemed SFU (Daily.co or self-hosted Janus)
- Backup vault + cross-region replication
- VPC Flow Logs + GuardDuty + SecurityHub
- AWS Backup plan with object lock
- Per-tenant data keys (envelope encryption helper)

## State backend

Each environment uses its own remote state. Bootstrap once per env:

```hcl
# Run once, not committed:
terraform {
  backend "s3" {
    bucket         = "cliniq-tfstate-dev"
    key            = "cliniq/dev/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "cliniq-tfstate-locks"
    encrypt        = true
  }
}
```

## Cost guardrails

- Dev environment is sized to fit under ~$80/mo: t4g.micro RDS, single NAT, single Fargate task.
- Prod target: ~$600–$1,200/mo at < 100 clinics, scaling with usage.
- All resources tagged `Project=ClinIQ`, `Environment=<env>`, `CostCenter=engineering`.

## Compliance posture

- All PHI buckets are KMS-encrypted, public access blocked, default `ObjectLock` (governance mode in dev, compliance in prod).
- Logs default to 30-day retention in dev, 6-year in prod (DPA + healthcare best practice).
- Bedrock invocations restricted to Anthropic Claude models in `ap-southeast-1`.
- No PHI ever crosses region except via explicit cross-region backup.

See `docs/09-regulatory-philippines.md` for the broader compliance context.
