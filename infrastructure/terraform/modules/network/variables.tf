variable "name" {
  description = "Name prefix (foodgrid-<env>)."
  type        = string
}

variable "cidr" {
  description = "VPC CIDR; must be a /16 so the fixed subnet layout fits. Keep it inside 10.0.0.0/8 (the admin ingress default trusts that range)."
  type        = string

  validation {
    condition     = can(cidrhost(var.cidr, 0)) && endswith(var.cidr, "/16")
    error_message = "cidr must be a valid IPv4 /16, e.g. 10.10.0.0/16."
  }
}

variable "az_count" {
  description = "Number of availability zones to spread subnets over."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3 (EKS and Multi-AZ RDS need at least two)."
  }
}

variable "cluster_name" {
  description = "EKS cluster name, used in the kubernetes.io/cluster/<name> subnet tag."
  type        = string
}

variable "single_nat_gateway" {
  description = "One shared NAT gateway (cheap, single-AZ egress) instead of one per AZ."
  type        = bool
  default     = false
}

variable "interface_endpoints" {
  description = "Interface endpoint services (suffix after com.amazonaws.<region>.)."
  type        = list(string)
  default     = ["ecr.api", "ecr.dkr", "sts", "secretsmanager", "logs"]
}

variable "interface_endpoints_all_azs" {
  description = "Place interface endpoint ENIs in every AZ (true) or only the first (cheaper, cross-AZ traffic)."
  type        = bool
  default     = true
}

variable "flow_logs_traffic_type" {
  description = "VPC flow log traffic type: ALL, ACCEPT or REJECT."
  type        = string
  default     = "ALL"

  validation {
    condition     = contains(["ALL", "ACCEPT", "REJECT"], var.flow_logs_traffic_type)
    error_message = "flow_logs_traffic_type must be ALL, ACCEPT or REJECT."
  }
}

variable "log_retention_days" {
  description = "Retention for the flow log group."
  type        = number
  default     = 30
}

variable "logs_kms_key_arn" {
  description = "KMS key that encrypts the flow log group."
  type        = string
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
