variable "name_prefix" {
  description = "Secret name prefix, foodgrid/<env>; the ExternalSecret overlays read <prefix>/app, /auth and /payment."
  type        = string

  validation {
    condition     = can(regex("^foodgrid/[a-z]+$", var.name_prefix))
    error_message = "name_prefix must look like foodgrid/<env>."
  }
}

variable "database_url" {
  description = "Initial DATABASE_URL (application role)."
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Initial REDIS_URL (rediss:// with AUTH token)."
  type        = string
  sensitive   = true
}

variable "recovery_window_days" {
  description = "Days a deleted secret can be restored (0 deletes immediately)."
  type        = number
  default     = 30

  validation {
    condition     = var.recovery_window_days == 0 || (var.recovery_window_days >= 7 && var.recovery_window_days <= 30)
    error_message = "recovery_window_days must be 0 or between 7 and 30."
  }
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
