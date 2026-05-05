output "alb_dns_name"       { value = module.compute.alb_dns_name }
output "ecr_api_repo_url"   { value = module.compute.ecr_api_repo_url }
output "rds_endpoint"       { value = module.database.endpoint, sensitive = true }
output "phi_bucket"         { value = module.storage.phi_bucket_name }
output "public_bucket"      { value = module.storage.public_bucket_name }
output "vpc_id"             { value = module.network.vpc_id }
output "task_role_arn"      { value = module.compute.task_role_arn }
output "bedrock_policy_arn" { value = module.ai_bedrock.policy_arn }
