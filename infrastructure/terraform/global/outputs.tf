output "github_variables" {
  description = "Repository-level GitHub Actions variables (Settings > Secrets and variables > Actions > Variables). Leave AWS_TERRAFORM_PLAN_ROLE_ARN unset when it is empty."
  value = {
    AWS_REGION                  = var.region
    AWS_ACCOUNT_ID              = local.account_id
    ECR_REGISTRY                = module.ecr.registry
    AWS_CI_ROLE_ARN             = aws_iam_role.ci.arn
    AWS_TERRAFORM_PLAN_ROLE_ARN = var.enable_terraform_plan_role ? aws_iam_role.plan[0].arn : ""
  }
}

output "terraform_plan_role_arn" {
  description = "Read-only plan role; set it as terraform_plan_role_arn in envs/*/terraform.tfvars (null when disabled)."
  value       = var.enable_terraform_plan_role ? aws_iam_role.plan[0].arn : null
}

output "github_oidc_provider_arn" {
  description = "IAM OIDC provider for token.actions.githubusercontent.com (the env deploy roles trust it)."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "ecr_repository_urls" {
  description = "ECR repository URLs keyed by image name."
  value       = module.ecr.repository_urls
}
