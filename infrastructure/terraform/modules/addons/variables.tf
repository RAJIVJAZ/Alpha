variable "cluster_name" {
  description = "EKS cluster name (foodgrid-<env>)."
  type        = string
}

variable "vpc_id" {
  description = "VPC of the cluster (the load balancer controller cannot read it from IMDS with hop limit 1)."
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

variable "system_node_selector" {
  description = "Node labels of the tainted system node group the controllers run on."
  type        = map(string)
}

variable "high_availability" {
  description = "Two replicas (with PodDisruptionBudgets) for the controllers and Alertmanager, and a larger Prometheus."
  type        = bool
  default     = false
}

variable "app_namespace" {
  description = "Namespace of the FoodGrid workloads (created here, applied to by the deploy role)."
  type        = string
  default     = "foodgrid"
}

variable "deployer_group" {
  description = "Kubernetes group of the GitHub deploy role's access entry; bound to the deployer Role."
  type        = string
}

variable "terraform_plan_group" {
  description = "Kubernetes group of the read-only Terraform plan role's access entry; null when not used."
  type        = string
  default     = null
}

variable "secrets_name_prefix" {
  description = "Secrets Manager prefix External Secrets may read (foodgrid/<env>)."
  type        = string
}

variable "secrets_kms_key_arn" {
  description = "KMS key of the application secrets."
  type        = string
}

variable "alarm_topic_arn" {
  description = "SNS topic Alertmanager publishes to."
  type        = string
}

variable "alarm_topic_kms_key_arn" {
  description = "KMS key of the alarm topic."
  type        = string
}

variable "logs_kms_key_arn" {
  description = "KMS key for the container log group."
  type        = string
}

variable "log_retention_days" {
  description = "Retention of the container log group."
  type        = number
  default     = 30
}

variable "chart_versions" {
  description = "Pinned Helm chart versions."
  type = object({
    aws_load_balancer_controller = string
    external_secrets             = string
    metrics_server               = string
    cluster_autoscaler           = string
    kube_prometheus_stack        = string
    aws_for_fluent_bit           = string
  })
  default = {
    aws_load_balancer_controller = "3.6.0"
    external_secrets             = "2.12.0"
    metrics_server               = "3.14.0"
    cluster_autoscaler           = "9.59.0"
    kube_prometheus_stack        = "92.0.0"
    aws_for_fluent_bit           = "0.2.0"
  }
  # a caller passing null gets these pins
  nullable = false
}

variable "cluster_autoscaler_image_tag" {
  description = "cluster-autoscaler image tag; its minor version must equal the cluster's Kubernetes minor (v1.35.x for 1.35)."
  type        = string

  validation {
    condition     = can(regex("^v1\\.[0-9]+\\.[0-9]+$", var.cluster_autoscaler_image_tag))
    error_message = "cluster_autoscaler_image_tag must look like v1.35.0."
  }
}

variable "prometheus_retention" {
  description = "Prometheus TSDB retention."
  type        = string
  default     = "15d"
}

variable "prometheus_storage_gb" {
  description = "Prometheus volume size in GiB."
  type        = number
  default     = 50
}

variable "tags" {
  description = "Tags for IAM roles and, through the controller's defaultTags, the ALBs it creates."
  type        = map(string)
  default     = {}
}
