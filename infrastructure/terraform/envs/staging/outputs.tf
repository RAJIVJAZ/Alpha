output "github_variables" {
  description = "Variables of the GitHub environment \"staging\" (Settings > Environments > staging > Variables)."
  value       = module.environment.github_variables
}

output "overlay_values" {
  description = "What overlays/staging's placeholders and hard-coded names resolve to, for checking the overlay against this stack."
  value       = module.environment.overlay_values
}

output "kubeconfig_command" {
  description = "Writes a kubeconfig entry for the cluster."
  value       = module.environment.kubeconfig_command
}

output "environment" {
  description = "Every output of the environment module (endpoints, ARNs, names; no secret values)."
  value       = module.environment
}
