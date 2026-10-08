# Operator settings for production (no secrets). Sizing lives in main.tf.

region             = "ap-south-1"
kubernetes_version = "1.35"

alarm_emails = [
  # "oncall@foodgrid.in",
]

# roles of the people who operate the cluster, besides whoever applies first
cluster_admin_principal_arns = [
  # "arn:aws:iam::123456789012:role/foodgrid-operator",
]

# GitHub-hosted runners deploy through the public endpoint
cluster_public_access_cidrs = ["0.0.0.0/0"]

# global stack output terraform_plan_role_arn, once enable_terraform_plan_role is on
terraform_plan_role_arn = null

# true after the first deploy has created the ALB (README, "DNS for the ingress hosts")
create_alb_dns_records = false
