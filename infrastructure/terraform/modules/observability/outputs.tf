output "kms_key_arn" {
  description = "KMS key for CloudWatch log groups and the alarm topic."
  value       = aws_kms_key.this.arn
}

output "alarm_topic_arn" {
  description = "SNS topic for CloudWatch alarms and Alertmanager."
  value       = aws_sns_topic.alarms.arn
}
