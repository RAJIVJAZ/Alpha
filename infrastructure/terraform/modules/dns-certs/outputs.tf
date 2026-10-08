output "zone_id" {
  description = "Hosted zone id."
  value       = data.aws_route53_zone.this.zone_id
}

output "certificate_arn" {
  description = "ALB certificate ARN."
  value       = module.certificate.arn
}

output "certificate_id" {
  description = "ALB certificate id (ACM_CERTIFICATE_ID, replaces STAGING_CERT_ID / PRODUCTION_CERT_ID)."
  value       = module.certificate.id
}

output "waf_web_acl_arn" {
  description = "WAF web ACL ARN, null when disabled."
  value       = var.waf_enabled ? aws_wafv2_web_acl.this[0].arn : null
}

output "waf_web_acl_id" {
  description = "WAF web ACL id (WAF_WEB_ACL_ID, replaces WAF_ID), null when disabled."
  value       = var.waf_enabled ? aws_wafv2_web_acl.this[0].id : null
}
