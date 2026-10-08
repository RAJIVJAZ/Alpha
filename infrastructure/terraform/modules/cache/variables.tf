variable "name" {
  description = "Replication group id (foodgrid-<env>)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,35}$", var.name))
    error_message = "name must be lowercase alphanumeric/hyphen, at most 36 characters (member ids append -001)."
  }
}

variable "vpc_id" {
  description = "VPC of the cache."
  type        = string
}

variable "subnet_ids" {
  description = "Private data subnets."
  type        = list(string)
}

variable "allowed_security_groups" {
  description = "Security groups (by a static label) allowed to connect on 6379 (the EKS cluster security group). Keys must be known at plan time; ids may not be."
  type        = map(string)
}

variable "engine" {
  description = "valkey or redis (both Redis OSS protocol compatible)."
  type        = string
  default     = "valkey"

  validation {
    condition     = contains(["valkey", "redis"], var.engine)
    error_message = "engine must be valkey or redis."
  }
}

variable "engine_version" {
  description = "Engine version."
  type        = string
  default     = "8.0"
}

variable "parameter_group_family" {
  description = "Parameter group family matching engine and version (valkey8, redis7, ...)."
  type        = string
  default     = "valkey8"
}

variable "node_type" {
  description = "Cache node type."
  type        = string
}

variable "num_cache_clusters" {
  description = "Nodes in the group: 1 = single node, 2+ = primary plus replicas with Multi-AZ automatic failover."
  type        = number

  validation {
    condition     = var.num_cache_clusters >= 1 && var.num_cache_clusters <= 6
    error_message = "num_cache_clusters must be between 1 and 6."
  }
}

variable "snapshot_retention_days" {
  description = "Daily snapshot retention (0 disables snapshots)."
  type        = number
  default     = 1
}

variable "snapshot_window" {
  description = "Daily snapshot window (UTC)."
  type        = string
  default     = "19:30-20:30"
}

variable "maintenance_window" {
  description = "Weekly maintenance window (UTC)."
  type        = string
  default     = "sun:22:00-sun:23:00"
}

variable "apply_immediately" {
  description = "Apply modifications now instead of in the maintenance window."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Retention of the slow and engine log groups."
  type        = number
  default     = 30
}

variable "logs_kms_key_arn" {
  description = "KMS key that encrypts the log groups."
  type        = string
}

variable "alarm_topic_arn" {
  description = "SNS topic for alarms."
  type        = string
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
