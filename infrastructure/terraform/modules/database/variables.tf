variable "identifier" {
  description = "RDS instance identifier (foodgrid-<env>)."
  type        = string
}

variable "vpc_id" {
  description = "VPC of the database."
  type        = string
}

variable "subnet_ids" {
  description = "Private data subnets."
  type        = list(string)
}

variable "allowed_security_groups" {
  description = "Security groups (by a static label) allowed to connect on 5432 (the EKS cluster security group). Keys must be known at plan time; ids may not be."
  type        = map(string)
}

variable "engine_major_version" {
  description = "PostgreSQL major version; keep it equal to the postgres image in infrastructure/docker/docker-compose.yml."
  type        = string
  default     = "16"

  validation {
    condition     = can(regex("^1[4-9]$", var.engine_major_version))
    error_message = "engine_major_version must be a PostgreSQL major version such as \"16\"."
  }
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
}

variable "allocated_storage_gb" {
  description = "Initial storage in GB."
  type        = number
  default     = 50
}

variable "max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling in GB."
  type        = number
  default     = 200

  validation {
    condition     = var.max_allocated_storage_gb >= var.allocated_storage_gb
    error_message = "max_allocated_storage_gb must be at least allocated_storage_gb."
  }
}

variable "multi_az" {
  description = "Synchronous standby in a second AZ."
  type        = bool
}

variable "backup_retention_days" {
  description = "Automated backup retention (point-in-time recovery window)."
  type        = number

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be between 1 and 35."
  }
}

variable "backup_window" {
  description = "Daily backup window (UTC). Default is 00:00-01:00 IST."
  type        = string
  default     = "18:30-19:30"
}

variable "maintenance_window" {
  description = "Weekly maintenance window (UTC). Default is Monday 02:30-03:30 IST, the quietest ordering hour."
  type        = string
  default     = "sun:21:00-sun:22:00"
}

variable "deletion_protection" {
  description = "Block instance deletion."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy (staging only)."
  type        = bool
  default     = false
}

variable "apply_immediately" {
  description = "Apply modifications now instead of in the maintenance window."
  type        = bool
  default     = false
}

variable "performance_insights_retention_days" {
  description = "Performance Insights retention (7 is free)."
  type        = number
  default     = 7
}

variable "monitoring_interval" {
  description = "Enhanced monitoring interval in seconds (0 disables)."
  type        = number
  default     = 60

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "monitoring_interval must be one of 0, 1, 5, 10, 15, 30, 60."
  }
}

variable "log_min_duration_ms" {
  description = "Log statements slower than this many milliseconds."
  type        = number
  default     = 500
}

variable "db_name" {
  description = "Database name."
  type        = string
  default     = "foodgrid"
}

variable "master_username" {
  description = "Master user (password managed by RDS in Secrets Manager)."
  type        = string
  default     = "foodgrid_admin"
}

variable "app_username" {
  description = "Login role the services and migrations use (owner of the database)."
  type        = string
  default     = "foodgrid_app"
}

variable "log_retention_days" {
  description = "Retention of the exported PostgreSQL logs."
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

variable "freeable_memory_alarm_mb" {
  description = "Alarm when freeable memory drops below this many MB."
  type        = number
  default     = 512
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
