output "address" {
  description = "Endpoint hostname."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Endpoint port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Database name."
  value       = aws_db_instance.this.db_name
}

output "identifier" {
  description = "Instance identifier."
  value       = aws_db_instance.this.identifier
}

output "master_username" {
  description = "Master user name."
  value       = aws_db_instance.this.username
}

output "master_user_secret_arn" {
  description = "Secrets Manager secret (managed by RDS) holding the master credentials."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "app_username" {
  description = "Application login role."
  value       = var.app_username
}

output "app_database_url" {
  description = "Prisma DATABASE_URL for the application role (TLS required by rds.force_ssl)."
  value       = "postgresql://${var.app_username}:${random_password.app.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${var.db_name}?schema=public&sslmode=require"
  sensitive   = true
}

output "security_group_id" {
  description = "Database security group."
  value       = aws_security_group.this.id
}
