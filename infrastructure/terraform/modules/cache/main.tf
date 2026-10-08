# ElastiCache (Valkey, Redis OSS compatible) replication group with cluster
# mode disabled: the services use plain ioredis clients on one endpoint
# (sessions, carts, geo, locks, Socket.IO adapter), which speak TLS when
# REDIS_URL uses rediss://.

locals {
  # member node ids are deterministic, so per-node alarms can be planned up front
  member_ids = [for i in range(var.num_cache_clusters) : format("%s-%03d", var.name, i + 1)]
  failover   = var.num_cache_clusters > 1
}

resource "aws_kms_key" "this" {
  description             = "${var.name}: ElastiCache at-rest encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = var.tags
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name}-cache"
  target_key_id = aws_kms_key.this.key_id
}

resource "aws_security_group" "this" {
  name        = "${var.name}-cache"
  description = "Valkey from EKS nodes and pods only"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name}-cache" })
}

resource "aws_vpc_security_group_ingress_rule" "valkey" {
  for_each = var.allowed_security_groups

  security_group_id            = aws_security_group.this.id
  description                  = "Valkey from ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = each.value
}

resource "aws_elasticache_subnet_group" "this" {
  name        = var.name
  description = "Private data subnets for ${var.name}"
  subnet_ids  = var.subnet_ids
  tags        = var.tags
}

resource "aws_elasticache_parameter_group" "this" {
  name        = "${var.name}-${replace(var.parameter_group_family, ".", "-")}"
  family      = var.parameter_group_family
  description = "FoodGrid ${var.engine} parameters"

  # only keys with a TTL may be evicted: session revocations, locks and carts
  # without expiry must never silently disappear under memory pressure
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "this" {
  for_each = toset(["slow-log", "engine-log"])

  name              = "/aws/elasticache/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

# AUTH token (16-128 printable characters; alphanumeric keeps REDIS_URL valid).
# Stored in Terraform state, like every generated credential; see the README.
resource "random_password" "auth" {
  length  = 64
  special = false
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.name
  description          = "FoodGrid cache, sessions and realtime fan-out (${var.name})"

  engine               = var.engine
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  parameter_group_name = aws_elasticache_parameter_group.this.name
  port                 = 6379

  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.this.id]
  automatic_failover_enabled = local.failover
  multi_az_enabled           = local.failover

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.this.arn
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  auth_token                 = random_password.auth.result

  snapshot_retention_limit   = var.snapshot_retention_days
  snapshot_window            = var.snapshot_window
  maintenance_window         = var.maintenance_window
  auto_minor_version_upgrade = true
  apply_immediately          = var.apply_immediately
  final_snapshot_identifier  = var.snapshot_retention_days > 0 ? "${var.name}-final" : null

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.this["slow-log"].name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.this["engine-log"].name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = var.tags

  lifecycle {
    # rotating the token is a deliberate procedure (README), not a side effect of a refresh
    ignore_changes = [auth_token]
  }
}
