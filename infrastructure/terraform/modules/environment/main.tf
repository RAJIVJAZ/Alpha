# One FoodGrid environment: VPC, EKS and its add-ons, PostgreSQL, Valkey, the
# media bucket behind CloudFront, certificates and WAF, the Secrets Manager
# secrets and the IAM roles. envs/staging and envs/production call it with
# their sizing; every name matches infrastructure/kubernetes/overlays/<env>.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# created by the global stack, which is applied first
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  name       = "foodgrid-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region

  app_namespace        = "foodgrid"
  secrets_prefix       = "foodgrid/${var.environment}"
  system_node_selector = { "foodgrid.in/node-group" = "system" }
  deployer_group       = "foodgrid:deployers"
  plan_group           = "foodgrid:terraform-plan"

  # browsers upload with presigned PUTs from the web apps; the API host serves no pages
  web_origins = [for h in var.ingress_hostnames : "https://${h}" if !startswith(h, "api.")]

  node_groups = {
    system = merge(var.system_node_group, {
      capacity_type = "ON_DEMAND"
      taints        = [{ key = "CriticalAddonsOnly", value = "true", effect = "NO_SCHEDULE" }]
    })
    app = var.app_node_group
  }

  access_entries = merge(
    {
      for arn in var.cluster_admin_principal_arns : "admin ${arn}" => {
        principal_arn     = arn
        policy_arn        = "arn:${local.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
        kubernetes_groups = []
      }
    },
    var.terraform_plan_role_arn == null ? {} : {
      terraform-plan = {
        principal_arn     = var.terraform_plan_role_arn
        policy_arn        = null
        kubernetes_groups = [local.plan_group]
      }
    },
  )
}

module "observability" {
  source = "../observability"

  name         = local.name
  alarm_emails = var.alarm_emails
}

module "network" {
  source = "../network"

  name                        = local.name
  cidr                        = var.vpc_cidr
  az_count                    = 3
  cluster_name                = local.name
  single_nat_gateway          = var.single_nat_gateway
  interface_endpoints_all_azs = var.interface_endpoints_all_azs
  log_retention_days          = var.log_retention_days
  logs_kms_key_arn            = module.observability.kms_key_arn
}

module "eks" {
  source = "../eks"

  cluster_name           = local.name
  kubernetes_version     = var.kubernetes_version
  subnet_ids             = module.network.private_app_subnet_ids
  endpoint_public_access = var.cluster_endpoint_public_access
  public_access_cidrs    = var.cluster_public_access_cidrs
  deletion_protection    = var.cluster_deletion_protection
  log_retention_days     = var.log_retention_days
  logs_kms_key_arn       = module.observability.kms_key_arn
  node_groups            = local.node_groups
  system_node_selector   = local.system_node_selector
  access_entries         = local.access_entries
  tags                   = var.tags
}

module "dns_certs" {
  source = "../dns-certs"

  route53_zone_name  = var.route53_zone_name
  hostnames          = var.ingress_hostnames
  cluster_name       = local.name
  create_alb_records = var.create_alb_dns_records
  waf_enabled        = var.waf_enabled
  waf_name           = var.waf_enabled ? local.name : null
  waf_rate_limit     = var.waf_rate_limit
  log_retention_days = var.log_retention_days
  logs_kms_key_arn   = module.observability.kms_key_arn
}

module "cdn_certificate" {
  source = "../acm-certificate"
  providers = {
    aws = aws.us_east_1
  }

  domain_names    = [var.cdn_domain]
  route53_zone_id = module.dns_certs.zone_id
}

module "storage" {
  source = "../storage"

  bucket_name          = "${local.name}-media"
  cdn_domain           = var.cdn_domain
  acm_certificate_arn  = module.cdn_certificate.arn
  route53_zone_id      = module.dns_certs.zone_id
  cors_allowed_origins = local.web_origins
}

module "database" {
  source = "../database"

  identifier               = local.name
  vpc_id                   = module.network.vpc_id
  subnet_ids               = module.network.private_data_subnet_ids
  allowed_security_groups  = { eks-cluster = module.eks.cluster_security_group_id }
  instance_class           = var.database.instance_class
  allocated_storage_gb     = var.database.allocated_storage_gb
  max_allocated_storage_gb = var.database.max_allocated_storage_gb
  multi_az                 = var.database.multi_az
  backup_retention_days    = var.database.backup_retention_days
  deletion_protection      = var.database.deletion_protection
  skip_final_snapshot      = var.database.skip_final_snapshot
  log_retention_days       = var.log_retention_days
  logs_kms_key_arn         = module.observability.kms_key_arn
  alarm_topic_arn          = module.observability.alarm_topic_arn
}

module "cache" {
  source = "../cache"

  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.private_data_subnet_ids
  allowed_security_groups = { eks-cluster = module.eks.cluster_security_group_id }
  node_type               = var.cache.node_type
  num_cache_clusters      = var.cache.num_cache_clusters
  snapshot_retention_days = var.cache.snapshot_retention_days
  log_retention_days      = var.log_retention_days
  logs_kms_key_arn        = module.observability.kms_key_arn
  alarm_topic_arn         = module.observability.alarm_topic_arn
}

module "secrets" {
  source = "../app-secrets"

  name_prefix          = local.secrets_prefix
  database_url         = module.database.app_database_url
  redis_url            = module.cache.redis_url
  recovery_window_days = var.secrets_recovery_window_days
}

module "iam" {
  source = "../iam"

  name                     = local.name
  cluster_name             = module.eks.cluster_name
  cluster_arn              = module.eks.cluster_arn
  oidc_provider_arn        = module.eks.oidc_provider_arn
  oidc_issuer_url          = module.eks.oidc_issuer_url
  app_namespace            = local.app_namespace
  media_bucket_arn         = module.storage.bucket_arn
  media_kms_key_arn        = module.storage.kms_key_arn
  ses_from_address         = var.ses_from_address
  allow_sns_sms            = var.allow_sns_sms
  github_oidc_provider_arn = data.aws_iam_openid_connect_provider.github.arn
  github_repository        = var.github_repository
  github_environment       = var.environment
  deployer_group           = local.deployer_group

  terraform_plan_role_name  = var.terraform_plan_role_arn == null ? null : reverse(split("/", var.terraform_plan_role_arn))[0]
  terraform_secret_versions = module.secrets.terraform_secret_versions
  secrets_kms_key_arn       = module.secrets.kms_key_arn
}

module "addons" {
  source = "../addons"

  cluster_name                 = module.eks.cluster_name
  vpc_id                       = module.network.vpc_id
  oidc_provider_arn            = module.eks.oidc_provider_arn
  oidc_issuer_url              = module.eks.oidc_issuer_url
  system_node_selector         = local.system_node_selector
  high_availability            = var.high_availability
  app_namespace                = local.app_namespace
  deployer_group               = local.deployer_group
  terraform_plan_group         = var.terraform_plan_role_arn == null ? null : local.plan_group
  secrets_name_prefix          = local.secrets_prefix
  secrets_kms_key_arn          = module.secrets.kms_key_arn
  alarm_topic_arn              = module.observability.alarm_topic_arn
  alarm_topic_kms_key_arn      = module.observability.kms_key_arn
  logs_kms_key_arn             = module.observability.kms_key_arn
  log_retention_days           = var.log_retention_days
  chart_versions               = var.chart_versions
  cluster_autoscaler_image_tag = coalesce(var.cluster_autoscaler_image_tag, "v${var.kubernetes_version}.0")
  prometheus_storage_gb        = var.prometheus_storage_gb
  tags                         = var.tags
}
