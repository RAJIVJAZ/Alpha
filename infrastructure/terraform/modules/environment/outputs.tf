output "github_variables" {
  description = "Variables for the GitHub environment of the same name (Settings > Environments > <env> > Variables)."
  value = merge(
    {
      EKS_CLUSTER_NAME    = module.eks.cluster_name
      AWS_DEPLOY_ROLE_ARN = module.iam.deploy_role_arn
      ACM_CERTIFICATE_ID  = module.dns_certs.certificate_id
    },
    var.waf_enabled ? { WAF_WEB_ACL_ID = module.dns_certs.waf_web_acl_id } : {},
  )
}

output "overlay_values" {
  description = "What the deploy-time placeholders and hard-coded names in overlays/<env> resolve to, for checking the overlay against this stack."
  value = merge(
    {
      ACCOUNT_ID                          = local.account_id
      "${upper(var.environment)}_CERT_ID" = module.dns_certs.certificate_id
      service_account_role_arn            = module.iam.app_role_arn
      S3_MEDIA_BUCKET                     = module.storage.bucket_name
      CDN_BASE_URL                        = module.storage.cdn_base_url
      external_secret_keys                = module.secrets.secret_names
    },
    var.waf_enabled ? { WAF_ID = module.dns_certs.waf_web_acl_id } : {},
  )
}

output "region" {
  description = "AWS region of the environment."
  value       = local.region
}

output "cluster_name" {
  description = "EKS cluster name (resolves once nodes and core add-ons are up)."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64 cluster CA certificate."
  value       = module.eks.cluster_certificate_authority_data
}

output "kubeconfig_command" {
  description = "Command that writes a kubeconfig entry for the cluster."
  value       = "aws eks update-kubeconfig --region ${local.region} --name ${module.eks.cluster_name}"
}

output "app_role_arn" {
  description = "IRSA role of the foodgrid-app service account."
  value       = module.iam.app_role_arn
}

output "deploy_role_arn" {
  description = "Role the GitHub environment assumes to deploy."
  value       = module.iam.deploy_role_arn
}

output "alb_certificate_arn" {
  description = "ACM certificate of the ingress ALB."
  value       = module.dns_certs.certificate_arn
}

output "waf_web_acl_arn" {
  description = "WAF web ACL ARN (null when disabled)."
  value       = module.dns_certs.waf_web_acl_arn
}

output "media_bucket" {
  description = "Media bucket name."
  value       = module.storage.bucket_name
}

output "cdn_base_url" {
  description = "CDN_BASE_URL."
  value       = module.storage.cdn_base_url
}

output "cdn_distribution_id" {
  description = "CloudFront distribution id (cache invalidations)."
  value       = module.storage.distribution_id
}

output "database_endpoint" {
  description = "PostgreSQL endpoint host:port."
  value       = "${module.database.address}:${module.database.port}"
}

output "database_master_secret_arn" {
  description = "RDS-managed secret with the master credentials (used once for the database bootstrap; the services never use it)."
  value       = module.database.master_user_secret_arn
}

output "database_app_username" {
  description = "Role the services connect as; create it with the README's database bootstrap."
  value       = module.database.app_username
}

output "redis_primary_endpoint" {
  description = "Valkey primary endpoint."
  value       = module.cache.primary_endpoint_address
}

output "secret_names" {
  description = "Secrets Manager secrets the ExternalSecrets read, keyed app / auth / payment."
  value       = module.secrets.secret_names
}

output "nat_public_ips" {
  description = "Egress IPs of the NAT gateways, for third-party allow-lists."
  value       = module.network.nat_public_ips
}

output "alarm_topic_arn" {
  description = "SNS topic for CloudWatch alarms and Alertmanager."
  value       = module.observability.alarm_topic_arn
}

output "container_log_group" {
  description = "CloudWatch log group with every container's logs."
  value       = module.addons.container_log_group
}

output "grafana_admin_secret" {
  description = "Kubernetes Secret with the Grafana admin login."
  value       = module.addons.grafana_admin_secret
}
