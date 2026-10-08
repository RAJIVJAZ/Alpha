variable "region" {
  description = "Region of the ECR repositories; the overlays and the env stacks assume ap-south-1."
  type        = string
  default     = "ap-south-1"
}

variable "github_repository" {
  description = "owner/name of the repository whose workflows assume the roles (OIDC subject)."
  type        = string
  default     = "RAJIVJAZ/Alpha"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "enable_terraform_plan_role" {
  description = "Create the read-only role the Terraform workflow assumes to plan pull requests (AWS_TERRAFORM_PLAN_ROLE_ARN). Anyone who can open a pull request in the repository can then read the account's configuration."
  type        = bool
  default     = false
}

variable "state_bucket_name" {
  description = "Terraform state bucket from the bootstrap stack; null means foodgrid-terraform-state-<account id>, the bootstrap default. Only the plan role uses it."
  type        = string
  default     = null
}

variable "max_tagged_images" {
  description = "Builds kept per ECR repository (production promotes images staging already ran, so keep enough to roll back)."
  type        = number
  default     = 300
}
