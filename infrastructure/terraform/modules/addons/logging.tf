# Container stdout/stderr (the services log JSON with pino) shipped by Fluent
# Bit to one CloudWatch log group per cluster, one stream per container, so
# logs outlive their pods. Terraform owns the group (retention, encryption);
# the IRSA role may only write to it.

resource "aws_cloudwatch_log_group" "containers" {
  name              = "/aws/eks/${var.cluster_name}/containers"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

data "aws_iam_policy_document" "fluent_bit" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.containers.arn}:*"]
  }
}

module "fluent_bit_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-fluent-bit"
  description       = "Fluent Bit in ${var.cluster_name} (writes ${aws_cloudwatch_log_group.containers.name})"
  oidc_provider_arn = var.oidc_provider_arn
  oidc_issuer_url   = var.oidc_issuer_url
  service_accounts  = ["kube-system:aws-for-fluent-bit"]
  inline_policies   = { write-container-logs = data.aws_iam_policy_document.fluent_bit.json }
  tags              = var.tags
}

resource "helm_release" "fluent_bit" {
  name       = "aws-for-fluent-bit"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-for-fluent-bit"
  version    = var.chart_versions.aws_for_fluent_bit
  namespace  = "kube-system"
  wait       = true

  values = [yamlencode({
    serviceAccount = {
      create      = true
      name        = "aws-for-fluent-bit"
      annotations = { "eks.amazonaws.com/role-arn" = module.fluent_bit_irsa.arn }
    }
    # a DaemonSet on every node, the tainted system group included
    tolerations = [{ operator = "Exists" }]

    cloudWatch = { enabled = false }
    cloudWatchLogs = {
      enabled           = true
      region            = local.region
      logGroupName      = aws_cloudwatch_log_group.containers.name
      logStreamTemplate = "$kubernetes['namespace_name'].$kubernetes['pod_name'].$kubernetes['container_name']"
      # used when a record has no Kubernetes metadata
      logStreamPrefix = "node-"
      autoCreateGroup = false
    }
    firehose      = { enabled = false }
    kinesis       = { enabled = false }
    elasticsearch = { enabled = false }
    opensearch    = { enabled = false }
  })]

  depends_on = [helm_release.aws_load_balancer_controller]
}
