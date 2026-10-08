data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region

  # SES authorizes a send against the address identity or, when only the
  # domain is verified, the domain identity
  ses_identity_arn_prefix = "arn:${local.partition}:ses:${local.region}:${local.account_id}:identity"
  ses_from_domain         = split("@", var.ses_from_address)[1]
}

# ─── Application role (IRSA) ───────────────────────────────────────────────
# Assumed by every FoodGrid pod through the foodgrid-app service account; the
# overlays annotate it with arn:aws:iam::<account>:role/foodgrid-<env>-app.
# What the code calls: S3 PutObject for presigned uploads (user-service),
# SES SendEmail (notification-service, EMAIL_PROVIDER=ses) and, when
# SMS_PROVIDER=sns, SNS Publish to phone numbers.

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "MediaUploads"
    actions   = ["s3:PutObject"]
    resources = ["${var.media_bucket_arn}/*"]
  }

  # presigned PUTs run as this role, so S3 asks KMS for a data key on its behalf
  statement {
    sid       = "MediaEncryption"
    actions   = ["kms:GenerateDataKey"]
    resources = [var.media_kms_key_arn]
  }

  statement {
    sid     = "TransactionalEmail"
    actions = ["ses:SendEmail"]
    resources = [
      "${local.ses_identity_arn_prefix}/${local.ses_from_domain}",
      "${local.ses_identity_arn_prefix}/${var.ses_from_address}",
    ]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.ses_from_address]
    }
  }

  dynamic "statement" {
    for_each = var.allow_sns_sms ? [1] : []

    content {
      sid     = "TransactionalSmsToPhoneNumbers"
      actions = ["sns:Publish"]
      # direct-to-phone publishes have no resource ARN; this excludes every topic
      not_resources = ["arn:${local.partition}:sns:*:*:*"]
    }
  }
}

module "app_role" {
  source = "../irsa-role"

  name              = "${var.name}-app"
  description       = "FoodGrid application pods (${var.app_namespace}/${var.app_service_account})"
  oidc_provider_arn = var.oidc_provider_arn
  oidc_issuer_url   = var.oidc_issuer_url
  service_accounts  = ["${var.app_namespace}:${var.app_service_account}"]
  inline_policies   = { foodgrid-app = data.aws_iam_policy_document.app.json }
  tags              = var.tags
}

# ─── GitHub Actions deploy role ────────────────────────────────────────────
# Only jobs running in the GitHub environment of the same name can assume it.
# It can describe the cluster (for `aws eks update-kubeconfig`); what it may do
# inside the cluster is the Kubernetes RBAC bound to var.deployer_group.

data "aws_iam_policy_document" "deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["eks:DescribeCluster"]
    resources = [var.cluster_arn]
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.name}-deploy"
  description          = "GitHub Actions deployments to ${var.cluster_name} (environment ${var.github_environment})"
  assume_role_policy   = data.aws_iam_policy_document.deploy_assume.json
  max_session_duration = 3600
  tags                 = var.tags
}

resource "aws_iam_role_policy" "deploy" {
  name   = "describe-cluster"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_eks_access_entry" "deploy" {
  cluster_name      = var.cluster_name
  principal_arn     = aws_iam_role.deploy.arn
  kubernetes_groups = [var.deployer_group]
  type              = "STANDARD"
  tags              = var.tags
}

# ─── Terraform plan role (optional) ─────────────────────────────────────────
# Pull-request plans refresh aws_secretsmanager_secret_version, which calls
# GetSecretValue on the version Terraform wrote. The read-only plan role from
# the global stack may read exactly those versions (their values are in the
# state it can already read), never the versions operators add later with the
# third-party credentials.

data "aws_iam_policy_document" "plan_secret_versions" {
  count = var.terraform_plan_role_name == null ? 0 : 1

  statement {
    sid       = "TerraformWrittenVersionsOnly"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [for v in var.terraform_secret_versions : v.secret_arn]

    condition {
      test     = "StringEquals"
      variable = "secretsmanager:VersionId"
      values   = [for v in var.terraform_secret_versions : v.version_id]
    }
  }

  statement {
    sid       = "DecryptThroughSecretsManager"
    actions   = ["kms:Decrypt"]
    resources = [var.secrets_kms_key_arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${local.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "plan_secret_versions" {
  count = var.terraform_plan_role_name == null ? 0 : 1

  name   = "${var.name}-terraform-secret-versions"
  role   = var.terraform_plan_role_name
  policy = data.aws_iam_policy_document.plan_secret_versions[0].json
}
