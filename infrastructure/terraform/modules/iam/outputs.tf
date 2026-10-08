output "app_role_arn" {
  description = "IRSA role for the foodgrid-app service account (the overlay's eks.amazonaws.com/role-arn)."
  value       = module.app_role.arn
}

output "deploy_role_arn" {
  description = "Role GitHub Actions assumes to deploy (AWS_DEPLOY_ROLE_ARN)."
  value       = aws_iam_role.deploy.arn
}
