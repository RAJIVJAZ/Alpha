variable "name" {
  description = "Name prefix (foodgrid-<env>); roles become <name>-app and <name>-deploy."
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name."
  type        = string
}

variable "cluster_arn" {
  description = "EKS cluster ARN."
  type        = string
}

variable "oidc_provider_arn" {
  description = "Cluster IAM OIDC provider ARN (IRSA)."
  type        = string
}

variable "oidc_issuer_url" {
  description = "Cluster OIDC issuer URL."
  type        = string
}

variable "app_namespace" {
  description = "Namespace of the FoodGrid workloads."
  type        = string
  default     = "foodgrid"
}

variable "app_service_account" {
  description = "Service account every FoodGrid pod runs as."
  type        = string
  default     = "foodgrid-app"
}

variable "media_bucket_arn" {
  description = "Media bucket ARN."
  type        = string
}

variable "media_kms_key_arn" {
  description = "KMS key of the media bucket."
  type        = string
}

variable "ses_from_address" {
  description = "Only sender address the application may use (SES_FROM_ADDRESS)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.ses_from_address))
    error_message = "ses_from_address must be an email address."
  }
}

variable "allow_sns_sms" {
  description = "Allow sending SMS through SNS (only needed with SMS_PROVIDER=sns)."
  type        = bool
  default     = false
}

variable "github_oidc_provider_arn" {
  description = "ARN of the token.actions.githubusercontent.com OIDC provider (created by the global stack)."
  type        = string
}

variable "github_repository" {
  description = "owner/name of the repository whose workflows deploy."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment allowed to assume the deploy role."
  type        = string
}

variable "deployer_group" {
  description = "Kubernetes group the deploy role maps to; the addons module binds RBAC to it."
  type        = string
}

variable "terraform_plan_role_name" {
  description = "Name of the global stack's read-only plan role; null when pull-request plans are not used."
  type        = string
  default     = null
}

variable "terraform_secret_versions" {
  description = "Secret versions Terraform wrote (secret_arn, version_id) that the plan role may read back."
  type = list(object({
    secret_arn = string
    version_id = string
  }))
  default = []
}

variable "secrets_kms_key_arn" {
  description = "KMS key of the application secrets (needed with terraform_plan_role_name)."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
