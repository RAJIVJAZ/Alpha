output "repository_arns" {
  description = "Repository ARNs keyed by image name."
  value       = { for k, r in aws_ecr_repository.this : k => r.arn }
}

output "repository_urls" {
  description = "Repository URLs keyed by image name."
  value       = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "registry" {
  description = "Registry host (<account>.dkr.ecr.<region>.amazonaws.com), the ECR_REGISTRY variable."
  value       = split("/", values(aws_ecr_repository.this)[0].repository_url)[0]
}
