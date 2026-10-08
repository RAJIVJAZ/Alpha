output "arn" {
  description = "Role ARN, for the eks.amazonaws.com/role-arn service account annotation."
  value       = aws_iam_role.this.arn
}

output "name" {
  description = "Role name."
  value       = aws_iam_role.this.name
}
