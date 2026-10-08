variable "name" {
  description = "IAM role name."
  type        = string
}

variable "description" {
  description = "IAM role description."
  type        = string
  default     = null
}

variable "oidc_provider_arn" {
  description = "ARN of the cluster's IAM OIDC provider."
  type        = string
}

variable "oidc_issuer_url" {
  description = "Cluster OIDC issuer URL (https://oidc.eks.<region>.amazonaws.com/id/<id>)."
  type        = string
}

variable "service_accounts" {
  description = "Service accounts allowed to assume the role, as \"<namespace>:<name>\"."
  type        = list(string)

  validation {
    condition     = length(var.service_accounts) > 0 && alltrue([for sa in var.service_accounts : can(regex("^[a-z0-9-]+:[a-z0-9-]+$", sa))])
    error_message = "Each entry must look like \"<namespace>:<service-account>\"."
  }
}

variable "inline_policies" {
  description = "Inline policies to attach, keyed by policy name (keys must be known at plan time)."
  type        = map(string)
  default     = {}
}

variable "managed_policy_arns" {
  description = "Managed policies to attach, keyed by a short static label."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags for the role."
  type        = map(string)
  default     = {}
}
