variable "name" { type = string }

variable "model_ids" {
  description = "Bedrock foundation model IDs allowed. Defaults to Claude Sonnet 4.6 + Haiku 4.5."
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}
