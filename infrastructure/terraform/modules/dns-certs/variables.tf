variable "route53_zone_name" {
  description = "Public hosted zone that serves the FoodGrid domain (looked up by name, not created)."
  type        = string
}

variable "hostnames" {
  description = "Every host in the environment's ingress overlay; the first becomes the certificate subject."
  type        = list(string)
}

variable "cluster_name" {
  description = "EKS cluster whose ALB gets the DNS records."
  type        = string
}

variable "ingress_group_name" {
  description = "alb.ingress.kubernetes.io/group.name of the ingresses (one shared ALB)."
  type        = string
  default     = "foodgrid"
}

variable "create_alb_records" {
  description = "Create Route53 aliases for the hosts. Enable after the first deploy has created the ALB."
  type        = bool
  default     = false
}

variable "waf_enabled" {
  description = "Create the regional WAF web ACL."
  type        = bool
  default     = false
}

variable "waf_name" {
  description = "WAF web ACL name; the overlay ARN embeds it (foodgrid-production)."
  type        = string
  default     = null

  validation {
    condition     = var.waf_name == null || can(regex("^[A-Za-z0-9_-]{1,128}$", var.waf_name))
    error_message = "waf_name may contain letters, digits, hyphens and underscores."
  }
}

variable "waf_rate_limit" {
  description = "Requests per 5 minutes from one IP before it is blocked."
  type        = number
  default     = 6000

  validation {
    condition     = var.waf_rate_limit >= 10
    error_message = "waf_rate_limit must be at least 10 (WAF minimum)."
  }
}

variable "log_retention_days" {
  description = "Retention of the WAF log group."
  type        = number
  default     = 30
}

variable "logs_kms_key_arn" {
  description = "KMS key that encrypts the WAF log group."
  type        = string
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
