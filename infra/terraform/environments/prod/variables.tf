variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN for the prod ALB"
  type        = string
}

variable "api_image" {
  description = "ECR image URI:tag for the api"
  type        = string
}
