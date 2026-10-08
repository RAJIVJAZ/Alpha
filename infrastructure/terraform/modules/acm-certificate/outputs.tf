output "arn" {
  description = "ARN of the issued certificate (available once validation succeeds)."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "id" {
  description = "Certificate id: the part of the ARN after certificate/ (the overlays' *_CERT_ID)."
  value       = element(split("/", aws_acm_certificate_validation.this.certificate_arn), 1)
}
