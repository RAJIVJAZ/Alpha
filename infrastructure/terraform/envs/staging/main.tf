# Staging: production's topology at a smaller size. Single NAT gateway, Spot
# app nodes, single-AZ database and cache, no WAF, easy teardown.
# Names must match infrastructure/kubernetes/overlays/staging.

locals {
  environment  = "staging"
  cluster_name = "foodgrid-${local.environment}"
  tags = {
    Project     = "foodgrid"
    Environment = local.environment
    ManagedBy   = "terraform"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}

# CloudFront only accepts viewer certificates from us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}

# Authenticates as whoever runs Terraform (the cluster creator is an admin;
# others need an entry in cluster_admin_principal_arns). Needs the AWS CLI.
provider "kubernetes" {
  host                   = module.environment.cluster_endpoint
  cluster_ca_certificate = base64decode(module.environment.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", local.cluster_name, "--region", var.region]
  }
}

provider "helm" {
  kubernetes = {
    host                   = module.environment.cluster_endpoint
    cluster_ca_certificate = base64decode(module.environment.cluster_certificate_authority_data)

    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", local.cluster_name, "--region", var.region]
    }
  }
}

module "environment" {
  source = "../../modules/environment"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment = local.environment
  tags        = local.tags

  # network
  vpc_cidr                    = "10.20.0.0/16"
  single_nat_gateway          = true
  interface_endpoints_all_azs = false

  # EKS
  kubernetes_version             = var.kubernetes_version
  cluster_deletion_protection    = false
  cluster_endpoint_public_access = true
  cluster_public_access_cidrs    = var.cluster_public_access_cidrs
  cluster_admin_principal_arns   = var.cluster_admin_principal_arns
  terraform_plan_role_arn        = var.terraform_plan_role_arn
  system_node_group = {
    instance_types = ["t3.large"]
    min_size       = 2
    max_size       = 3
    desired_size   = 2
  }
  # Spot across several 2 vCPU / 8 GiB types; staging tolerates interruptions
  app_node_group = {
    instance_types = ["t3.large", "t3a.large", "m5.large", "m6i.large"]
    capacity_type  = "SPOT"
    min_size       = 2
    max_size       = 5
    desired_size   = 2
  }
  high_availability     = false
  prometheus_storage_gb = 20

  # data stores
  database = {
    # Performance Insights needs medium or larger
    instance_class           = "db.t4g.medium"
    allocated_storage_gb     = 20
    max_allocated_storage_gb = 100
    multi_az                 = false
    backup_retention_days    = 7
    deletion_protection      = false
    skip_final_snapshot      = true
  }
  cache = {
    node_type               = "cache.t4g.small"
    num_cache_clusters      = 1
    snapshot_retention_days = 1
  }
  secrets_recovery_window_days = 7

  # edge: every host of overlays/staging's Ingresses (the first is the certificate subject)
  route53_zone_name = var.route53_zone_name
  ingress_hostnames = [
    "staging.foodgrid.in",
    "api.staging.foodgrid.in",
    "partner.staging.foodgrid.in",
    "business.staging.foodgrid.in",
    "supplier.staging.foodgrid.in",
    "rider.staging.foodgrid.in",
    "admin.staging.foodgrid.in",
  ]
  cdn_domain             = "cdn.staging.foodgrid.in"
  create_alb_dns_records = var.create_alb_dns_records
  waf_enabled            = false

  # operations
  log_retention_days = 30
  alarm_emails       = var.alarm_emails
}
