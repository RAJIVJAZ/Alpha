resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.chart_versions.aws_load_balancer_controller
  namespace  = "kube-system"
  wait       = true
  timeout    = 600

  values = [yamlencode(merge(local.placement, {
    clusterName  = var.cluster_name
    region       = local.region
    vpcId        = var.vpc_id
    replicaCount = local.replicas
    serviceAccount = {
      create      = true
      name        = "aws-load-balancer-controller"
      annotations = { "eks.amazonaws.com/role-arn" = module.load_balancer_controller_irsa.arn }
    }
    # Services stay ClusterIP; the controller must not take over type=LoadBalancer
    enableServiceMutatorWebhook = false
    podDisruptionBudget         = { maxUnavailable = 1 }
    defaultTags                 = var.tags
  }))]
}

resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = var.chart_versions.external_secrets
  namespace        = local.external_secrets_namespace
  create_namespace = true
  wait             = true
  timeout          = 600

  values = [yamlencode(merge(local.placement, {
    replicaCount = local.replicas
    # the chart defaults to no leader election: two replicas would both reconcile
    leaderElect         = local.replicas > 1
    podDisruptionBudget = { enabled = var.high_availability, minAvailable = 1 }
    serviceAccount = {
      create      = true
      name        = "external-secrets"
      annotations = { "eks.amazonaws.com/role-arn" = module.external_secrets_irsa.arn }
    }
    webhook = merge(local.placement, {
      replicaCount        = local.replicas
      podDisruptionBudget = { enabled = var.high_availability, minAvailable = 1 }
    })
    certController = merge(local.placement, { replicaCount = 1 })
  }))]

  depends_on = [helm_release.aws_load_balancer_controller]
}

# ClusterSecretStore aws-secrets-manager, shipped as a tiny local chart so it
# is applied by Helm after the External Secrets CRDs exist (kubernetes_manifest
# would need them at plan time).
resource "helm_release" "cluster_config" {
  name      = "foodgrid-cluster-config"
  chart     = "${path.module}/charts/foodgrid-cluster-config"
  namespace = local.external_secrets_namespace
  wait      = true

  values = [yamlencode({
    region       = local.region
    appNamespace = var.app_namespace
  })]

  depends_on = [helm_release.external_secrets]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.chart_versions.metrics_server
  namespace  = "kube-system"
  wait       = true

  values = [yamlencode(merge(local.placement, {
    replicas            = local.replicas
    podDisruptionBudget = { enabled = var.high_availability, maxUnavailable = 1 }
  }))]

  depends_on = [helm_release.aws_load_balancer_controller]
}

resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  version    = var.chart_versions.cluster_autoscaler
  namespace  = "kube-system"
  wait       = true

  values = [yamlencode(merge(local.placement, {
    awsRegion     = local.region
    autoDiscovery = { clusterName = var.cluster_name }
    # the autoscaler minor version must match the cluster's Kubernetes minor
    image = { tag = var.cluster_autoscaler_image_tag }
    rbac = {
      serviceAccount = {
        create      = true
        name        = "cluster-autoscaler"
        annotations = { "eks.amazonaws.com/role-arn" = module.cluster_autoscaler_irsa.arn }
      }
    }
    extraArgs = {
      balance-similar-node-groups   = true
      skip-nodes-with-system-pods   = false
      skip-nodes-with-local-storage = false
      expander                      = "least-waste"
    }
  }))]

  depends_on = [helm_release.aws_load_balancer_controller]
}
