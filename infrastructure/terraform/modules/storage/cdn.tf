# CloudFront in front of the media bucket at the CDN_BASE_URL host. Its viewer
# certificate must live in us-east-1: the env root issues it through the
# acm-certificate module with the aws.us_east_1 provider alias.

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = var.bucket_name
  description                       = "CloudFront to ${var.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# forwards Origin and Access-Control-Request-* so S3 can answer CORS preflights
data "aws_cloudfront_origin_request_policy" "cors" {
  name = "Managed-CORS-S3Origin"
}

# The cache key does not include Origin, so S3's own CORS headers would be cached
# for whichever viewer came first; CloudFront sets them per request instead.
resource "aws_cloudfront_response_headers_policy" "media" {
  name    = "${var.bucket_name}-cors-security"
  comment = "CORS for the FoodGrid web origins plus security headers"

  cors_config {
    access_control_allow_credentials = false
    access_control_max_age_sec       = 3000
    origin_override                  = true

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }

    access_control_allow_origins {
      items = var.cors_allowed_origins
    }
  }

  security_headers_config {
    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      override                   = true
    }
  }
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  comment         = "FoodGrid media (${var.bucket_name})"
  aliases         = [var.cdn_domain]
  http_version    = "http2and3"
  is_ipv6_enabled = true
  # PriceClass_100 has no Indian edge locations; 200 adds Asia including India
  price_class = var.price_class

  origin {
    origin_id                = "media"
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id           = "media"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.media.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = var.tags
}

resource "aws_route53_record" "cdn" {
  for_each = toset(["A", "AAAA"])

  zone_id = var.route53_zone_id
  name    = var.cdn_domain
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}
