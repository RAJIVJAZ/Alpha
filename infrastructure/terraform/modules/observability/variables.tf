variable "name" {
  description = "Name prefix for the environment (foodgrid-<env>)."
  type        = string
}

variable "alarm_emails" {
  description = "Email addresses subscribed to the alarm topic (each must confirm the subscription)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for e in var.alarm_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
    error_message = "alarm_emails must contain valid email addresses."
  }
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
