variable "bucket_name" {
  description = "Media bucket name (foodgrid-<env>-media, as in the overlay's S3_MEDIA_BUCKET)."
  type        = string
}

variable "cdn_domain" {
  description = "CDN host name (the overlay's CDN_BASE_URL host)."
  type        = string
}

variable "acm_certificate_arn" {
  description = "Validated ACM certificate in us-east-1 covering cdn_domain."
  type        = string

  validation {
    condition     = startswith(var.acm_certificate_arn, "arn:") && strcontains(var.acm_certificate_arn, ":us-east-1:")
    error_message = "CloudFront needs an ACM certificate from us-east-1."
  }
}

variable "route53_zone_id" {
  description = "Hosted zone for the CDN alias records."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Web origins allowed to upload with presigned URLs."
  type        = list(string)

  validation {
    condition     = length(var.cors_allowed_origins) > 0 && alltrue([for o in var.cors_allowed_origins : startswith(o, "https://")])
    error_message = "cors_allowed_origins must be a non-empty list of https:// origins."
  }
}

variable "noncurrent_version_expiration_days" {
  description = "Days to keep overwritten or deleted object versions."
  type        = number
  default     = 30
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_200 or PriceClass_All include Indian edge locations."
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Use PriceClass_200 or PriceClass_All; PriceClass_100 serves India from distant edges."
  }
}

variable "force_destroy" {
  description = "Allow destroying the bucket with objects in it (never in production)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}
