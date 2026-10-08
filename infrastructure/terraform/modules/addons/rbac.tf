# What the GitHub deploy role (EKS access entry -> var.deployer_group) may do:
# apply the overlay and the migrate Job in the app namespace and watch the
# rollout. It cannot read Secrets (External Secrets writes those) and has no
# rights outside the namespace except patching the namespace object itself.

locals {
  deploy_verbs = ["get", "list", "watch", "create", "update", "patch", "delete"]
  read_verbs   = ["get", "list", "watch"]
}

resource "kubernetes_role_v1" "deployer" {
  metadata {
    name      = "foodgrid-deployer"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  rule {
    api_groups = [""]
    resources  = ["configmaps", "services", "serviceaccounts"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = [""]
    resources  = ["pods", "pods/log", "events", "endpoints"]
    verbs      = local.read_verbs
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = ["apps"]
    resources  = ["replicasets"]
    verbs      = local.read_verbs
  }

  rule {
    api_groups = ["batch"]
    resources  = ["jobs"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = ["autoscaling"]
    resources  = ["horizontalpodautoscalers"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = ["policy"]
    resources  = ["poddisruptionbudgets"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["ingresses", "networkpolicies"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = ["external-secrets.io"]
    resources  = ["externalsecrets"]
    verbs      = local.deploy_verbs
  }

  rule {
    api_groups = ["monitoring.coreos.com"]
    resources  = ["servicemonitors", "prometheusrules"]
    verbs      = local.deploy_verbs
  }
}

resource "kubernetes_role_binding_v1" "deployer" {
  metadata {
    name      = "foodgrid-deployer"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.deployer.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = var.deployer_group
  }
}

# the overlay contains the Namespace object, so kubectl apply reads and patches it
resource "kubernetes_cluster_role_v1" "deployer_namespace" {
  metadata {
    name = "foodgrid-deployer-namespace"
  }

  rule {
    api_groups     = [""]
    resources      = ["namespaces"]
    resource_names = [kubernetes_namespace_v1.app.metadata[0].name]
    verbs          = ["get", "patch", "update"]
  }
}

resource "kubernetes_cluster_role_binding_v1" "deployer_namespace" {
  metadata {
    name = "foodgrid-deployer-namespace"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role_v1.deployer_namespace.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = var.deployer_group
  }
}

# ─── Terraform plan role (optional) ─────────────────────────────────────────
# Pull-request plans refresh the helm releases and kubernetes_* resources here.
# The built-in view role covers workloads (never Secrets); this adds the RBAC
# and StorageClass objects Terraform manages, and Secrets only in the
# namespaces holding Helm release records (FoodGrid's synced Secrets are not
# readable).

locals {
  plan_enabled            = var.terraform_plan_group != null
  helm_release_namespaces = toset(["kube-system", local.external_secrets_namespace, local.monitoring_namespace])
}

resource "kubernetes_cluster_role_binding_v1" "plan_view" {
  count = local.plan_enabled ? 1 : 0

  metadata {
    name = "foodgrid-terraform-plan-view"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = "view"
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = var.terraform_plan_group
  }
}

resource "kubernetes_cluster_role_v1" "plan" {
  count = local.plan_enabled ? 1 : 0

  metadata {
    name = "foodgrid-terraform-plan"
  }

  rule {
    api_groups = ["rbac.authorization.k8s.io"]
    resources  = ["roles", "rolebindings", "clusterroles", "clusterrolebindings"]
    verbs      = local.read_verbs
  }

  rule {
    api_groups = ["storage.k8s.io"]
    resources  = ["storageclasses"]
    verbs      = local.read_verbs
  }
}

resource "kubernetes_cluster_role_binding_v1" "plan" {
  count = local.plan_enabled ? 1 : 0

  metadata {
    name = "foodgrid-terraform-plan"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role_v1.plan[0].metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = var.terraform_plan_group
  }
}

resource "kubernetes_role_v1" "plan_helm_releases" {
  for_each = local.plan_enabled ? local.helm_release_namespaces : toset([])

  metadata {
    name      = "foodgrid-terraform-plan-helm-releases"
    namespace = each.value
  }

  rule {
    api_groups = [""]
    resources  = ["secrets"]
    verbs      = local.read_verbs
  }

  depends_on = [helm_release.external_secrets, kubernetes_namespace_v1.monitoring]
}

resource "kubernetes_role_binding_v1" "plan_helm_releases" {
  for_each = kubernetes_role_v1.plan_helm_releases

  metadata {
    name      = "foodgrid-terraform-plan-helm-releases"
    namespace = each.value.metadata[0].namespace
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = each.value.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = var.terraform_plan_group
  }
}
