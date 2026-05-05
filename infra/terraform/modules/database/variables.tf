variable "name"               { type = string }
variable "subnet_ids"         { type = list(string) }
variable "security_group_id"  { type = string }

variable "instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "max_allocated_storage_gb" {
  type    = number
  default = 100
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "log_statements" {
  description = "Log all statements (dev only — noisy)"
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
