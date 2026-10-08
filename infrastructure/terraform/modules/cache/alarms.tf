resource "aws_cloudwatch_metric_alarm" "engine_cpu" {
  for_each = toset(local.member_ids)

  alarm_name          = "${each.value}-cache-cpu-high"
  alarm_description   = "Valkey engine CPU above 75% for 15 minutes (single-threaded command execution)"
  namespace           = "AWS/ElastiCache"
  metric_name         = "EngineCPUUtilization"
  dimensions          = { CacheClusterId = each.value }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 75
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags

  depends_on = [aws_elasticache_replication_group.this]
}

resource "aws_cloudwatch_metric_alarm" "memory" {
  for_each = toset(local.member_ids)

  alarm_name          = "${each.value}-cache-memory-high"
  alarm_description   = "Valkey memory above 80% of maxmemory"
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  dimensions          = { CacheClusterId = each.value }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags

  depends_on = [aws_elasticache_replication_group.this]
}

resource "aws_cloudwatch_metric_alarm" "evictions" {
  for_each = toset(local.member_ids)

  alarm_name          = "${each.value}-cache-evictions"
  alarm_description   = "Valkey is evicting keys: carts and cached data are being dropped"
  namespace           = "AWS/ElastiCache"
  metric_name         = "Evictions"
  dimensions          = { CacheClusterId = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags

  depends_on = [aws_elasticache_replication_group.this]
}
