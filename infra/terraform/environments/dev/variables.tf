variable "aws_region" {
  description = "AWS region for ClinIQ dev (PH region by default)"
  type        = string
  default     = "ap-southeast-1"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener. Issue via ACM after registering the domain."
  type        = string
}

variable "api_image" {
  description = "Full ECR image URI:tag for the api container. Use a placeholder for first apply, then push & redeploy."
  type        = string
  default     = "public.ecr.aws/nginx/nginx:stable"
}
