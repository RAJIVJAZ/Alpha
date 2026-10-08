variable "environment" {
  description = "staging or production; every name derives from it (foodgrid-<env>, foodgrid/<env>/*, foodgrid-<env>-media)."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production (the overlays exist for those two)."
  }
}

variable "tags" {
  description = "Standard tags (Project, Environment, ManagedBy) for what the provider's default_tags cannot reach: node instances and volumes, and the ALBs the load balancer controller creates."
  type        = map(string)
}

variable "github_repository" {
  description = "owner/name of the repository whose workflows deploy (OIDC subject)."
  type        = string
  default     = "RAJIVJAZ/Alpha"
}

# ─── Network ───────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "VPC /16; give each environment its own range so they could be peered later."
  type        = string
}

variable "single_nat_gateway" {
  description = "One NAT gateway for the VPC instead of one per AZ."
  type        = bool
}

variable "interface_endpoints_all_azs" {
  description = "Interface endpoint ENIs in every AZ (true) or only the first."
  type        = bool
}

# ─── EKS ───────────────────────────────────────────────────────────────────

variable "kubernetes_version" {
  description = "EKS Kubernetes minor version. Keep kubectl in .github/workflows/deploy.yml within one minor of it."
  type        = string
}

variable "system_node_group" {
  description = "On-demand node group for cluster add-ons (tainted CriticalAddonsOnly)."
  type = object({
    instance_types = list(string)
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size_gb   = optional(number, 50)
  })
}

variable "app_node_group" {
  description = "Node group for the FoodGrid workloads."
  type = object({
    instance_types = list(string)
    capacity_type  = optional(string, "ON_DEMAND")
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size_gb   = optional(number, 50)
  })
}

variable "cluster_endpoint_public_access" {
  description = "Public Kubernetes API endpoint (GitHub-hosted runners deploy through it)."
  type        = bool
  default     = true
}

variable "cluster_public_access_cidrs" {
  description = "CIDRs allowed to reach the public API endpoint."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cluster_deletion_protection" {
  description = "EKS deletion protection."
  type        = bool

  validation {
    condition     = var.environment != "production" || var.cluster_deletion_protection
    error_message = "Production keeps EKS deletion protection on."
  }
}

variable "cluster_admin_principal_arns" {
  description = "IAM roles/users given cluster-admin through access entries (operators' SSO roles). Do not list the principal that created the cluster: EKS already made it an admin."
  type        = list(string)
  default     = []
}

variable "terraform_plan_role_arn" {
  description = "ARN of the global stack's read-only plan role (output terraform_plan_role_arn); null when pull-request plans are not used."
  type        = string
  default     = null
}

# ─── Data stores ───────────────────────────────────────────────────────────

variable "database" {
  description = "RDS PostgreSQL sizing and protection."
  type = object({
    instance_class           = string
    allocated_storage_gb     = number
    max_allocated_storage_gb = number
    multi_az                 = bool
    backup_retention_days    = number
    deletion_protection      = bool
    skip_final_snapshot      = bool
  })

  validation {
    condition = var.environment != "production" || (
      var.database.multi_az && var.database.deletion_protection && !var.database.skip_final_snapshot && var.database.backup_retention_days >= 14
    )
    error_message = "Production PostgreSQL must be Multi-AZ, deletion protected, keep a final snapshot and at least 14 days of backups."
  }
}

variable "cache" {
  description = "ElastiCache (Valkey) sizing; num_cache_clusters >= 2 enables Multi-AZ automatic failover."
  type = object({
    node_type               = string
    num_cache_clusters      = number
    snapshot_retention_days = number
  })

  validation {
    condition     = var.environment != "production" || var.cache.num_cache_clusters >= 2
    error_message = "Production Valkey needs a replica (num_cache_clusters >= 2) for Multi-AZ failover."
  }
}

variable "secrets_recovery_window_days" {
  description = "Days a deleted Secrets Manager secret can be restored."
  type        = number
  default     = 30
}

# ─── Edge ──────────────────────────────────────────────────────────────────

variable "route53_zone_name" {
  description = "Existing public hosted zone that serves the domain (looked up, not created)."
  type        = string
  default     = "foodgrid.in"
}

variable "ingress_hostnames" {
  description = "Every host of the environment's Ingresses in infrastructure/kubernetes/overlays/<env>; all go on the ALB certificate."
  type        = list(string)

  validation {
    condition     = length(var.ingress_hostnames) > 0 && length(var.ingress_hostnames) <= 10
    error_message = "ingress_hostnames needs 1-10 names (ACM's default limit per certificate)."
  }
}

variable "cdn_domain" {
  description = "Host of CDN_BASE_URL in the overlay (cdn.foodgrid.in, cdn.staging.foodgrid.in)."
  type        = string
}

variable "create_alb_dns_records" {
  description = "Create Route53 aliases for the ingress hosts. Turn on after the first deploy has created the ALB."
  type        = bool
  default     = false
}

variable "waf_enabled" {
  description = "Create the regional WAF web ACL foodgrid-<env> (the production overlay references foodgrid-production)."
  type        = bool

  validation {
    condition     = var.environment != "production" || var.waf_enabled
    error_message = "The production overlay attaches the foodgrid-production web ACL, so production needs waf_enabled."
  }
}

variable "waf_rate_limit" {
  description = "Requests per IP per 5 minutes before WAF blocks it."
  type        = number
  default     = 6000
}

# ─── Application ───────────────────────────────────────────────────────────

variable "ses_from_address" {
  description = "SES_FROM_ADDRESS from the overlay ConfigMap; the only sender the app role may use."
  type        = string
  default     = "no-reply@foodgrid.in"
}

variable "allow_sns_sms" {
  description = "Let the app role send SMS through SNS (only for SMS_PROVIDER=sns; the overlays use msg91)."
  type        = bool
  default     = false
}

# ─── Operations ────────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "Retention of every CloudWatch log group of the environment."
  type        = number

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a retention CloudWatch Logs accepts (7, 14, 30, 90, 365, ...)."
  }
}

variable "alarm_emails" {
  description = "Email addresses subscribed to the alarm topic."
  type        = list(string)
  default     = []
}

variable "high_availability" {
  description = "Two replicas of each cluster controller and Alertmanager, larger Prometheus."
  type        = bool
}

variable "prometheus_storage_gb" {
  description = "Prometheus volume size in GiB."
  type        = number
  default     = 50
}

variable "chart_versions" {
  description = "Override the pinned Helm chart versions of the add-ons (keys as in modules/addons); null keeps the module defaults."
  type = object({
    aws_load_balancer_controller = string
    external_secrets             = string
    metrics_server               = string
    cluster_autoscaler           = string
    kube_prometheus_stack        = string
    aws_for_fluent_bit           = string
  })
  default = null
}

variable "cluster_autoscaler_image_tag" {
  description = "cluster-autoscaler image tag; null derives v<kubernetes_version>.0."
  type        = string
  default     = null
}
