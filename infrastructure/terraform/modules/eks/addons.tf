# Core EKS add-ons. vpc-cni and kube-proxy must exist before nodes join;
# coredns and the EBS CSI driver need nodes to schedule on.

locals {
  oidc_issuer_url = aws_eks_cluster.this.identity[0].oidc[0].issuer

  system_tolerations = [{ key = "CriticalAddonsOnly", operator = "Exists", effect = "NoSchedule" }]

  before_compute_addons = {
    vpc-cni = {
      role_arn = module.vpc_cni_irsa.arn
      # enforces the NetworkPolicies shipped in infrastructure/kubernetes/base
      configuration = { enableNetworkPolicy = "true" }
    }
    kube-proxy = {
      role_arn      = null
      configuration = null
    }
  }

  after_compute_addons = {
    coredns = {
      role_arn = null
      configuration = {
        replicaCount = 2
        nodeSelector = var.system_node_selector
        tolerations  = local.system_tolerations
      }
    }
    aws-ebs-csi-driver = {
      role_arn      = module.ebs_csi_irsa.arn
      configuration = null
    }
  }
}

module "vpc_cni_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-vpc-cni"
  description       = "aws-node (VPC CNI) in ${var.cluster_name}"
  oidc_provider_arn = aws_iam_openid_connect_provider.this.arn
  oidc_issuer_url   = local.oidc_issuer_url
  service_accounts  = ["kube-system:aws-node"]
  managed_policy_arns = {
    cni = "arn:${local.partition}:iam::aws:policy/AmazonEKS_CNI_Policy"
  }
  tags = var.tags
}

module "ebs_csi_irsa" {
  source = "../irsa-role"

  name              = "${var.cluster_name}-ebs-csi"
  description       = "EBS CSI controller in ${var.cluster_name}"
  oidc_provider_arn = aws_iam_openid_connect_provider.this.arn
  oidc_issuer_url   = local.oidc_issuer_url
  service_accounts  = ["kube-system:ebs-csi-controller-sa"]
  managed_policy_arns = {
    ebs = "arn:${local.partition}:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  }
  tags = var.tags
}

# EKS's default add-on version for the cluster's Kubernetes version, so
# upgrading kubernetes_version also moves the add-ons along
data "aws_eks_addon_version" "this" {
  for_each = merge(local.before_compute_addons, local.after_compute_addons)

  addon_name         = each.key
  kubernetes_version = aws_eks_cluster.this.version
  most_recent        = var.addons_most_recent
}

resource "aws_eks_addon" "before_compute" {
  for_each = local.before_compute_addons

  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.key
  addon_version               = data.aws_eks_addon_version.this[each.key].version
  service_account_role_arn    = each.value.role_arn
  configuration_values        = each.value.configuration == null ? null : jsonencode(each.value.configuration)
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
  tags                        = var.tags
}

resource "aws_eks_addon" "after_compute" {
  for_each = local.after_compute_addons

  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.key
  addon_version               = data.aws_eks_addon_version.this[each.key].version
  service_account_role_arn    = each.value.role_arn
  configuration_values        = each.value.configuration == null ? null : jsonencode(each.value.configuration)
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
  tags                        = var.tags

  depends_on = [aws_eks_node_group.this]
}
