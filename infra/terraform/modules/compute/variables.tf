variable "name"                         { type = string }
variable "production"                   { type = bool, default = false }
variable "vpc_id"                       { type = string }
variable "public_subnet_ids"            { type = list(string) }
variable "private_subnet_ids"           { type = list(string) }
variable "alb_security_group_id"        { type = string }
variable "ecs_tasks_security_group_id"  { type = string }

variable "acm_certificate_arn" {
  description = "ACM cert ARN for the ALB HTTPS listener (in same region)."
  type        = string
}

variable "api_image" {
  description = "Full ECR image URI:tag for the api container. Use a placeholder until first push."
  type        = string
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "secret_arns" {
  description = "ARNs the task execution role can read (DB url, JWT secret, etc.)"
  type        = list(string)
  default     = []
}

variable "kms_key_arns" {
  description = "KMS keys the task may decrypt"
  type        = list(string)
  default     = []
}

variable "phi_bucket_arns" {
  description = "PHI S3 bucket ARNs the task may read/write"
  type        = list(string)
  default     = []
}

variable "bedrock_policy_arn" {
  description = "ARN of the Bedrock invoke policy from the ai-bedrock module"
  type        = string
  default     = ""
}

variable "env_secret_arns" {
  description = "Map of env-var name -> Secrets Manager ARN for the api container"
  type        = map(string)
  default     = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
