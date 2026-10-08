variable "region" {
  description = "Region of the state bucket (the backend blocks in global and envs/* say ap-south-1)."
  type        = string
  default     = "ap-south-1"
}

variable "state_bucket_name" {
  description = "State bucket name; null uses foodgrid-terraform-state-<account id>, which global also assumes."
  type        = string
  default     = null

  validation {
    condition     = var.state_bucket_name == null || can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_name must be a valid S3 bucket name."
  }
}

variable "noncurrent_version_days" {
  description = "Days an overwritten state version is kept (the 20 newest are kept regardless)."
  type        = number
  default     = 90
}
