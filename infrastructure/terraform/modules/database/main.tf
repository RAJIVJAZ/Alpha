# RDS PostgreSQL for the Prisma multi-schema database. The master password is
# generated and rotated by RDS in its own Secrets Manager secret
# (manage_master_user_password); the services connect as a separate,
# non-superuser role whose password Terraform generates and hands to the
# app-secrets module as DATABASE_URL. That role is created once with the SQL
# in the README ("Database bootstrap"), because Terraform cannot reach the
# private database.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

resource "aws_kms_key" "this" {
  description             = "${var.identifier}: RDS storage, Performance Insights and master secret"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = var.tags
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.identifier}-rds"
  target_key_id = aws_kms_key.this.key_id
}

resource "aws_security_group" "this" {
  name        = "${var.identifier}-postgres"
  description = "PostgreSQL from EKS nodes and pods only"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.identifier}-postgres" })
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  for_each = var.allowed_security_groups

  security_group_id            = aws_security_group.this.id
  description                  = "PostgreSQL from ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = each.value
}

resource "aws_db_subnet_group" "this" {
  name        = var.identifier
  description = "Private data subnets for ${var.identifier}"
  subnet_ids  = var.subnet_ids
  tags        = var.tags
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.identifier}-pg${var.engine_major_version}-"
  family      = "postgres${var.engine_major_version}"
  description = "FoodGrid PostgreSQL ${var.engine_major_version}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = tostring(var.log_min_duration_ms)
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  # log temp files above 10 MB (sorts and hashes spilling to disk)
  parameter {
    name  = "log_temp_files"
    value = "10240"
  }

  parameter {
    name  = "log_autovacuum_min_duration"
    value = "1000"
  }

  # a stuck transaction holding locks fails instead of blocking order writes forever
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "300000"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

data "aws_iam_policy_document" "monitoring_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "monitoring" {
  name               = "${var.identifier}-rds-monitoring"
  assume_role_policy = data.aws_iam_policy_document.monitoring_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  role       = aws_iam_role.monitoring.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# RDS would create these without retention; pre-creating them sets retention and encryption
resource "aws_cloudwatch_log_group" "this" {
  for_each = toset(["postgresql", "upgrade"])

  name              = "/aws/rds/instance/${var.identifier}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_db_instance" "this" {
  identifier = var.identifier

  engine                      = "postgres"
  engine_version              = var.engine_major_version
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  instance_class              = var.instance_class
  parameter_group_name        = aws_db_parameter_group.this.name
  ca_cert_identifier          = "rds-ca-rsa2048-g1"

  db_name                       = var.db_name
  username                      = var.master_username
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.this.arn

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.this.arn

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  publicly_accessible    = false
  port                   = 5432

  backup_retention_period   = var.backup_retention_days
  backup_window             = var.backup_window
  maintenance_window        = var.maintenance_window
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.identifier}-final"

  iam_database_authentication_enabled   = true
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.this.arn
  performance_insights_retention_period = var.performance_insights_retention_days
  monitoring_interval                   = var.monitoring_interval
  monitoring_role_arn                   = aws_iam_role.monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  apply_immediately = var.apply_immediately
  tags              = var.tags

  depends_on = [aws_cloudwatch_log_group.this, aws_iam_role_policy_attachment.monitoring]
}

# Password of the application role (alphanumeric so it needs no URL encoding).
# Stored in Terraform state, like every generated credential; see the README.
resource "random_password" "app" {
  length  = 40
  special = false
}
