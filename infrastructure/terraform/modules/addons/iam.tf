# One IRSA role per controller, each limited to this environment's resources
# (staging and production share an AWS account).

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region
}

module "load_balancer_controller_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-aws-load-balancer-controller"
  description       = "AWS Load Balancer Controller in ${var.cluster_name}"
  oidc_provider_arn = var.oidc_provider_arn
  oidc_issuer_url   = var.oidc_issuer_url
  service_accounts  = ["kube-system:aws-load-balancer-controller"]
  inline_policies = {
    aws-load-balancer-controller = templatefile("${path.module}/policies/aws-load-balancer-controller.json.tftpl", {
      partition    = local.partition
      region       = local.region
      account_id   = local.account_id
      cluster_name = var.cluster_name
      vpc_arn      = "arn:${local.partition}:ec2:${local.region}:${local.account_id}:vpc/${var.vpc_id}"
    })
  }
  tags = var.tags
}

data "aws_iam_policy_document" "external_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = ["arn:${local.partition}:secretsmanager:${local.region}:${local.account_id}:secret:${var.secrets_name_prefix}/*"]
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.secrets_kms_key_arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${local.region}.amazonaws.com"]
    }
  }
}

module "external_secrets_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-external-secrets"
  description       = "External Secrets Operator in ${var.cluster_name} (reads ${var.secrets_name_prefix}/*)"
  oidc_provider_arn = var.oidc_provider_arn
  oidc_issuer_url   = var.oidc_issuer_url
  service_accounts  = ["${local.external_secrets_namespace}:external-secrets"]
  inline_policies   = { read-app-secrets = data.aws_iam_policy_document.external_secrets.json }
  tags              = var.tags
}

data "aws_iam_policy_document" "cluster_autoscaler" {
  # only the ASGs EKS created for this cluster's managed node groups
  statement {
    actions = [
      "autoscaling:SetDesiredCapacity",
      "autoscaling:TerminateInstanceInAutoScalingGroup",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/k8s.io/cluster-autoscaler/${var.cluster_name}"
      values   = ["owned"]
    }
  }

  statement {
    actions = [
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeAutoScalingInstances",
      "autoscaling:DescribeLaunchConfigurations",
      "autoscaling:DescribeScalingActivities",
      "autoscaling:DescribeTags",
      "ec2:DescribeImages",
      "ec2:DescribeInstanceTypes",
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:GetInstanceTypesFromInstanceRequirements",
    ]
    resources = ["*"]
  }

  statement {
    actions   = ["eks:DescribeNodegroup"]
    resources = ["arn:${local.partition}:eks:${local.region}:${local.account_id}:nodegroup/${var.cluster_name}/*/*"]
  }
}

module "cluster_autoscaler_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-cluster-autoscaler"
  description       = "cluster-autoscaler in ${var.cluster_name}"
  oidc_provider_arn = var.oidc_provider_arn
  oidc_issuer_url   = var.oidc_issuer_url
  service_accounts  = ["kube-system:cluster-autoscaler"]
  inline_policies   = { cluster-autoscaler = data.aws_iam_policy_document.cluster_autoscaler.json }
  tags              = var.tags
}

# Alertmanager forwards PrometheusRule alerts to the same SNS topic as the CloudWatch alarms
data "aws_iam_policy_document" "alertmanager" {
  statement {
    actions   = ["sns:Publish"]
    resources = [var.alarm_topic_arn]
  }

  statement {
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = [var.alarm_topic_kms_key_arn]
  }
}

module "alertmanager_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-alertmanager"
  description       = "Alertmanager in ${var.cluster_name} (publishes to the alarm topic)"
  oidc_provider_arn = var.oidc_provider_arn
  oidc_issuer_url   = var.oidc_issuer_url
  service_accounts  = ["${local.monitoring_namespace}:${local.alertmanager_service_account}"]
  inline_policies   = { publish-alarms = data.aws_iam_policy_document.alertmanager.json }
  tags              = var.tags
}
