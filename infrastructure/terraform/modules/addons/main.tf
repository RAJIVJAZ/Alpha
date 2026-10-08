# In-cluster platform: ALB ingress, External Secrets (+ the ClusterSecretStore
# the FoodGrid ExternalSecrets reference), metrics-server for the HPAs,
# cluster-autoscaler, kube-prometheus-stack for the ServiceMonitor and
# PrometheusRule in infrastructure/monitoring, Fluent Bit shipping container
# logs to CloudWatch, the default gp3 StorageClass and the RBAC the GitHub
# deploy role (and the optional Terraform plan role) map to.
#
# The helm and kubernetes providers are configured by the calling root from
# the EKS module outputs. Only typed kubernetes_* resources and helm releases
# are used, so planning never needs CRDs to exist yet.

locals {
  external_secrets_namespace   = "external-secrets"
  monitoring_namespace         = "monitoring"
  alertmanager_service_account = "kube-prometheus-stack-alertmanager"

  # controllers run on the tainted system node group
  system_tolerations = [{ key = "CriticalAddonsOnly", operator = "Exists", effect = "NoSchedule" }]
  placement = {
    nodeSelector = var.system_node_selector
    tolerations  = local.system_tolerations
  }

  replicas = var.high_availability ? 2 : 1
}

resource "kubernetes_namespace_v1" "app" {
  metadata {
    name = var.app_namespace
    labels = {
      "app.kubernetes.io/part-of" = "foodgrid"
      # every FoodGrid manifest already meets "restricted"; warn and audit so
      # one-off debug pods are not rejected outright
      "pod-security.kubernetes.io/warn"  = "restricted"
      "pod-security.kubernetes.io/audit" = "restricted"
    }
  }

  lifecycle {
    # the overlay re-applies this namespace with kubectl and adds its own annotations
    ignore_changes = [metadata[0].annotations]
  }
}

resource "kubernetes_namespace_v1" "monitoring" {
  metadata {
    name   = local.monitoring_namespace
    labels = { "app.kubernetes.io/part-of" = "foodgrid" }
  }
}

# EBS CSI (installed by the eks module) provisions encrypted gp3 volumes for Prometheus and Alertmanager
resource "kubernetes_storage_class_v1" "gp3" {
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner    = "ebs.csi.aws.com"
  reclaim_policy         = "Delete"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true

  parameters = {
    type      = "gp3"
    encrypted = "true"
    fsType    = "ext4"
  }
}
