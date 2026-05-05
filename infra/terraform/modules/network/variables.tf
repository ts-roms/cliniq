variable "name" {
  description = "Name prefix for all network resources, e.g. cliniq-dev"
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR"
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Number of AZs to span (2 for dev, 3 for prod)"
  type        = number
  default     = 2
}

variable "single_nat" {
  description = "Use a single NAT Gateway (cheap dev) instead of one per AZ"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Common tags applied to every resource"
  type        = map(string)
  default     = {}
}
