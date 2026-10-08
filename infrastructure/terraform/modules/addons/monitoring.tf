# kube-prometheus-stack: Prometheus Operator CRDs (ServiceMonitor,
# PrometheusRule), Prometheus, Alertmanager and Grafana. The release must be
# named kube-prometheus-stack and live in the monitoring namespace:
# infrastructure/monitoring labels its objects release=kube-prometheus-stack
# and the FoodGrid NetworkPolicy only admits scrapes from "monitoring".

resource "random_password" "grafana_admin" {
  length  = 32
  special = false
}

resource "kubernetes_secret_v1" "grafana_admin" {
  metadata {
    name      = "grafana-admin"
    namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
  }

  data = {
    admin-user     = "admin"
    admin-password = random_password.grafana_admin.result
  }
}

resource "helm_release" "kube_prometheus_stack" {
  name       = "kube-prometheus-stack"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = var.chart_versions.kube_prometheus_stack
  namespace  = kubernetes_namespace_v1.monitoring.metadata[0].name
  wait       = true
  timeout    = 900

  values = [yamlencode({
    # EKS runs these control plane components; they cannot be scraped and would only raise alerts
    kubeControllerManager = { enabled = false }
    kubeScheduler         = { enabled = false }
    kubeEtcd              = { enabled = false }
    kubeProxy             = { enabled = false }

    prometheusOperator = merge(local.placement, {
      admissionWebhooks = { patch = local.placement }
    })
    kube-state-metrics = local.placement

    prometheus = {
      prometheusSpec = merge(local.placement, {
        retention = var.prometheus_retention
        resources = {
          requests = { cpu = "200m", memory = var.high_availability ? "2Gi" : "1Gi" }
          limits   = { memory = var.high_availability ? "4Gi" : "2Gi" }
        }
        storageSpec = {
          volumeClaimTemplate = {
            spec = {
              storageClassName = kubernetes_storage_class_v1.gp3.metadata[0].name
              accessModes      = ["ReadWriteOnce"]
              resources        = { requests = { storage = "${var.prometheus_storage_gb}Gi" } }
            }
          }
        }
      })
    }

    alertmanager = {
      serviceAccount = {
        create      = true
        name        = local.alertmanager_service_account
        annotations = { "eks.amazonaws.com/role-arn" = module.alertmanager_irsa.arn }
      }
      alertmanagerSpec = merge(local.placement, {
        replicas = local.replicas
        storage = {
          volumeClaimTemplate = {
            spec = {
              storageClassName = kubernetes_storage_class_v1.gp3.metadata[0].name
              accessModes      = ["ReadWriteOnce"]
              resources        = { requests = { storage = "5Gi" } }
            }
          }
        }
      })
      config = {
        route = {
          receiver        = "sns"
          group_by        = ["alertname", "namespace", "service"]
          group_wait      = "30s"
          group_interval  = "5m"
          repeat_interval = "4h"
          routes = [
            { receiver = "null", matchers = ["alertname = \"Watchdog\""] },
            { receiver = "null", matchers = ["alertname = \"InfoInhibitor\""] },
          ]
        }
        receivers = [
          { name = "null" },
          {
            name = "sns"
            sns_configs = [{
              topic_arn     = var.alarm_topic_arn
              sigv4         = { region = local.region }
              subject       = "[${var.cluster_name}] {{ .CommonLabels.alertname }} ({{ .Status }})"
              send_resolved = true
            }]
          },
        ]
      }
    }

    grafana = merge(local.placement, {
      admin = {
        existingSecret = kubernetes_secret_v1.grafana_admin.metadata[0].name
        userKey        = "admin-user"
        passwordKey    = "admin-password"
      }
      # dashboards ship as ConfigMaps labelled grafana_dashboard=1 in the app namespace
      sidecar = { dashboards = { enabled = true, searchNamespace = "ALL" } }
    })
  })]

  depends_on = [helm_release.aws_load_balancer_controller]
}
