# Production: a NAT gateway and interface endpoints in every AZ, on-demand
# nodes in three AZs, Multi-AZ PostgreSQL and Valkey, WAF, deletion protection.
# Names must match infrastructure/kubernetes/overlays/production.

locals {
  environment  = "production"
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
  vpc_cidr                    = "10.10.0.0/16"
  single_nat_gateway          = false
  interface_endpoints_all_azs = true

  # EKS: both groups span the three private app subnets, so min 3 puts a node in every AZ
  kubernetes_version             = var.kubernetes_version
  cluster_deletion_protection    = true
  cluster_endpoint_public_access = true
  cluster_public_access_cidrs    = var.cluster_public_access_cidrs
  cluster_admin_principal_arns   = var.cluster_admin_principal_arns
  terraform_plan_role_arn        = var.terraform_plan_role_arn
  system_node_group = {
    instance_types = ["m6i.large"]
    min_size       = 3
    max_size       = 4
    desired_size   = 3
  }
  app_node_group = {
    instance_types = ["m6i.xlarge"]
    min_size       = 3
    max_size       = 12
    desired_size   = 3
  }
  high_availability     = true
  prometheus_storage_gb = 100

  # data stores
  database = {
    instance_class           = "db.r6g.large"
    allocated_storage_gb     = 100
    max_allocated_storage_gb = 500
    multi_az                 = true
    backup_retention_days    = 30
    deletion_protection      = true
    skip_final_snapshot      = false
  }
  cache = {
    node_type               = "cache.r6g.large"
    num_cache_clusters      = 2
    snapshot_retention_days = 7
  }
  secrets_recovery_window_days = 30

  # edge: every host of overlays/production's Ingresses (the first is the certificate subject)
  route53_zone_name = var.route53_zone_name
  ingress_hostnames = [
    "foodgrid.in",
    "www.foodgrid.in",
    "api.foodgrid.in",
    "partner.foodgrid.in",
    "business.foodgrid.in",
    "supplier.foodgrid.in",
    "rider.foodgrid.in",
    "admin.foodgrid.in",
  ]
  cdn_domain             = "cdn.foodgrid.in"
  create_alb_dns_records = var.create_alb_dns_records
  # the overlay attaches .../regional/webacl/foodgrid-production/WAF_ID
  waf_enabled = true

  # operations
  log_retention_days = 90
  alarm_emails       = var.alarm_emails
}
