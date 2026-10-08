variable "cluster_name" {
  description = "EKS cluster name (foodgrid-<env>)."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes minor version. Check what EKS offers with `aws eks describe-cluster-versions`; upgrade one minor at a time."
  type        = string

  validation {
    condition     = can(regex("^1\\.(3[3-9]|[4-9][0-9])$", var.kubernetes_version))
    error_message = "kubernetes_version must be a minor version string of 1.33 or newer, e.g. \"1.35\"."
  }
}

variable "support_type" {
  description = "EKS upgrade policy: STANDARD (auto-upgrade when standard support ends, no extra fee) or EXTENDED (paid extended support)."
  type        = string
  default     = "STANDARD"

  validation {
    condition     = contains(["STANDARD", "EXTENDED"], var.support_type)
    error_message = "support_type must be STANDARD or EXTENDED."
  }
}

variable "subnet_ids" {
  description = "Private application subnets for the control plane ENIs and the node groups."
  type        = list(string)
}

variable "endpoint_public_access" {
  description = "Expose the Kubernetes API endpoint publicly (needed for GitHub-hosted runners unless they reach the VPC another way)."
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "CIDRs allowed to reach the public API endpoint (authentication still applies)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cluster_log_types" {
  description = "Control plane log types sent to CloudWatch."
  type        = list(string)
  default     = ["api", "audit", "authenticator"]
}

variable "log_retention_days" {
  description = "Retention of the control plane log group."
  type        = number
  default     = 30
}

variable "logs_kms_key_arn" {
  description = "KMS key that encrypts the control plane log group."
  type        = string
}

variable "deletion_protection" {
  description = "Block cluster deletion through the EKS API."
  type        = bool
  default     = false
}

variable "node_groups" {
  description = "Managed node groups keyed by short name (system, app)."
  type = map(object({
    instance_types = list(string)
    capacity_type  = optional(string, "ON_DEMAND")
    ami_type       = optional(string, "AL2023_x86_64_STANDARD")
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size_gb   = optional(number, 50)
    labels         = optional(map(string), {})
    taints = optional(list(object({
      key    = string
      value  = optional(string)
      effect = string
    })), [])
  }))

  validation {
    condition     = alltrue([for g in values(var.node_groups) : contains(["ON_DEMAND", "SPOT"], g.capacity_type)])
    error_message = "capacity_type must be ON_DEMAND or SPOT."
  }

  validation {
    condition     = alltrue([for g in values(var.node_groups) : g.min_size <= g.desired_size && g.desired_size <= g.max_size])
    error_message = "Each node group needs min_size <= desired_size <= max_size."
  }
}

variable "node_metadata_hop_limit" {
  description = "IMDSv2 PUT response hop limit on nodes. 1 blocks pods without hostNetwork from the instance metadata service."
  type        = number
  default     = 1
}

variable "system_node_selector" {
  description = "Node labels that select the system node group (used for coredns)."
  type        = map(string)
}

variable "enable_ssm" {
  description = "Attach AmazonSSMManagedInstanceCore to nodes so operators can open SSM sessions instead of SSH."
  type        = bool
  default     = true
}

variable "addons_most_recent" {
  description = "Use the newest add-on versions instead of EKS's default version for the cluster's Kubernetes version."
  type        = bool
  default     = false
}

variable "access_entries" {
  description = "Extra IAM principals with cluster access. policy_arn is an EKS access policy; namespaces = null means cluster scope."
  type = map(object({
    principal_arn     = string
    policy_arn        = optional(string)
    namespaces        = optional(list(string))
    kubernetes_groups = optional(list(string), [])
  }))
  default = {}
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
