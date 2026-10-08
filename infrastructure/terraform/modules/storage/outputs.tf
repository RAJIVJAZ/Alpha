output "bucket_name" {
  description = "Media bucket name (S3_MEDIA_BUCKET)."
  value       = aws_s3_bucket.media.id
}

output "bucket_arn" {
  description = "Media bucket ARN."
  value       = aws_s3_bucket.media.arn
}

output "kms_key_arn" {
  description = "KMS key encrypting the media bucket (uploaders need kms:GenerateDataKey)."
  value       = aws_kms_key.media.arn
}

output "cdn_base_url" {
  description = "CDN_BASE_URL."
  value       = "https://${var.cdn_domain}"
}

output "distribution_id" {
  description = "CloudFront distribution id (for invalidations)."
  value       = aws_cloudfront_distribution.media.id
}

output "distribution_domain_name" {
  description = "CloudFront domain name."
  value       = aws_cloudfront_distribution.media.domain_name
}
