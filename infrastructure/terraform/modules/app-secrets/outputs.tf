output "secret_names" {
  description = "Secret names keyed by app, auth and payment."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.name }
}

output "secret_arns" {
  description = "Secret ARNs keyed by app, auth and payment."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "kms_key_arn" {
  description = "KMS key encrypting the secrets (External Secrets needs kms:Decrypt)."
  value       = aws_kms_key.this.arn
}

output "terraform_secret_versions" {
  description = "The versions Terraform wrote (secret_arn, version_id); later operator versions are not listed."
  value = [
    for k, v in aws_secretsmanager_secret_version.initial : {
      secret_arn = aws_secretsmanager_secret.this[k].arn
      version_id = v.version_id
    }
  ]
}
