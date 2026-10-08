variable "region" {
  description = "AWS region. The overlays hard-code ap-south-1 in the certificate and WAF ARNs, so change both together."
  type        = string
  default     = "ap-south-1"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes minor version (1.33 or newer); upgrade one minor at a time."
  type        = string
  default     = "1.35"
}

variable "alarm_emails" {
  description = "Email addresses subscribed to the alarm topic (each confirms by mail)."
  type        = list(string)
  default     = []
}

variable "cluster_admin_principal_arns" {
  description = "IAM roles given cluster-admin through EKS access entries (operators' SSO roles). Leave out the principal that first applied this stack: EKS already made it an admin."
  type        = list(string)
  default     = []
}

variable "cluster_public_access_cidrs" {
  description = "CIDRs that can reach the public Kubernetes API endpoint (GitHub-hosted runners deploy through it)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "terraform_plan_role_arn" {
  description = "The global stack's terraform_plan_role_arn output, to let pull-request plans read this stack; null when not used."
  type        = string
  default     = null
}

variable "route53_zone_name" {
  description = "Existing public hosted zone of the domain."
  type        = string
  default     = "foodgrid.in"
}

variable "create_alb_dns_records" {
  description = "Point the ingress hosts at the ALB. Set to true after the first deploy has created the ALB."
  type        = bool
  default     = false
}
