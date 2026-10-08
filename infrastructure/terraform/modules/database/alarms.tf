locals {
  alarm_dimensions = { DBInstanceIdentifier = aws_db_instance.this.identifier }
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name          = "${var.identifier}-rds-cpu-high"
  alarm_description   = "RDS CPU above 80% for 15 minutes"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = local.alarm_dimensions
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "free_storage" {
  alarm_name          = "${var.identifier}-rds-storage-low"
  alarm_description   = "RDS free storage below 10% of the allocated size (autoscaling may be at its ceiling)"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = local.alarm_dimensions
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.allocated_storage_gb * 1024 * 1024 * 1024 * 0.1
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "freeable_memory" {
  alarm_name          = "${var.identifier}-rds-memory-low"
  alarm_description   = "RDS freeable memory below ${var.freeable_memory_alarm_mb} MB for 15 minutes"
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = local.alarm_dimensions
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.freeable_memory_alarm_mb * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags
}
