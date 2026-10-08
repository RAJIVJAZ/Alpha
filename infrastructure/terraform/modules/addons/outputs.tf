output "app_namespace" {
  description = "Namespace the FoodGrid overlay deploys into."
  value       = kubernetes_namespace_v1.app.metadata[0].name
}

output "monitoring_namespace" {
  description = "Namespace of kube-prometheus-stack (Grafana: kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80)."
  value       = kubernetes_namespace_v1.monitoring.metadata[0].name
}

output "grafana_admin_secret" {
  description = "Kubernetes Secret holding the Grafana admin login (namespace/name); the password is not output."
  value       = "${kubernetes_secret_v1.grafana_admin.metadata[0].namespace}/${kubernetes_secret_v1.grafana_admin.metadata[0].name}"
}

output "container_log_group" {
  description = "CloudWatch log group Fluent Bit ships container logs to."
  value       = aws_cloudwatch_log_group.containers.name
}

output "irsa_role_arns" {
  description = "IRSA roles of the controllers."
  value = {
    aws_load_balancer_controller = module.load_balancer_controller_irsa.arn
    external_secrets             = module.external_secrets_irsa.arn
    cluster_autoscaler           = module.cluster_autoscaler_irsa.arn
    alertmanager                 = module.alertmanager_irsa.arn
    fluent_bit                   = module.fluent_bit_irsa.arn
  }
}
