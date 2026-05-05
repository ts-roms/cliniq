variable "name"        { type = string }
variable "production"  { type = bool, default = false }
variable "enable_object_lock" {
  description = "Object Lock for PHI bucket. Requires bucket creation; cannot be enabled later."
  type        = bool
  default     = false
}
variable "tags" {
  type    = map(string)
  default = {}
}
