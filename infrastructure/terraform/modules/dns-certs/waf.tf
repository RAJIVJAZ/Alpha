# Regional WAF for the public ALB. The ingress overlay references it as
# .../regional/webacl/<name>/WAF_ID, so the name is part of the contract.

locals {
  managed_rule_groups = {
    AWSManagedRulesAmazonIpReputationList = { priority = 10, count_rules = [] }
    # API payloads above 8 KB (menus, bulk stock updates) are legitimate
    AWSManagedRulesCommonRuleSet         = { priority = 30, count_rules = ["SizeRestrictions_BODY"] }
    AWSManagedRulesKnownBadInputsRuleSet = { priority = 40, count_rules = [] }
    AWSManagedRulesSQLiRuleSet           = { priority = 50, count_rules = [] }
  }
}

resource "aws_wafv2_web_acl" "this" {
  count = var.waf_enabled ? 1 : 0

  name        = var.waf_name
  description = "FoodGrid public ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups

    content {
      name     = rule.key
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = rule.key
          vendor_name = "AWS"

          dynamic "rule_action_override" {
            for_each = rule.value.count_rules

            content {
              name = rule_action_override.value

              action_to_use {
                count {}
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  # Many Indian mobile users share carrier-grade NAT addresses, so the limit is
  # per IP but generous; tune it from the WAF metrics.
  rule {
    name     = "rate-limit-per-ip"
    priority = 20

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-per-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = var.waf_name
    sampled_requests_enabled   = true
  }

  tags = var.tags

  lifecycle {
    precondition {
      condition     = var.waf_name != null
      error_message = "waf_name is required when waf_enabled is true."
    }
  }
}

# WAF only accepts log groups whose name starts with aws-waf-logs-
resource "aws_cloudwatch_log_group" "waf" {
  count = var.waf_enabled ? 1 : 0

  name              = "aws-waf-logs-${var.waf_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  count = var.waf_enabled ? 1 : 0

  resource_arn            = aws_wafv2_web_acl.this[0].arn
  log_destination_configs = [aws_cloudwatch_log_group.waf[0].arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
}
