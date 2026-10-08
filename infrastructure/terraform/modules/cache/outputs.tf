output "primary_endpoint_address" {
  description = "Primary (read/write) endpoint; follows failovers."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  description = "Port."
  value       = aws_elasticache_replication_group.this.port
}

output "replication_group_id" {
  description = "Replication group id."
  value       = aws_elasticache_replication_group.this.id
}

output "redis_url" {
  description = "REDIS_URL for ioredis: TLS (rediss://) with the AUTH token."
  value       = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:${aws_elasticache_replication_group.this.port}"
  sensitive   = true
}

output "security_group_id" {
  description = "Cache security group."
  value       = aws_security_group.this.id
}
