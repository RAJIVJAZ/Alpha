output "cluster_name" {
  description = "Cluster name, available once nodes and core add-ons are up (consumers that deploy into the cluster wait for it)."
  value       = aws_eks_cluster.this.name

  depends_on = [aws_eks_node_group.this, aws_eks_addon.after_compute]
}

output "cluster_arn" {
  description = "Cluster ARN."
  value       = aws_eks_cluster.this.arn
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded cluster CA certificate."
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_version" {
  description = "Kubernetes version of the control plane."
  value       = aws_eks_cluster.this.version
}

output "cluster_security_group_id" {
  description = "EKS-managed cluster security group, attached to the control plane ENIs, every managed node and therefore every pod."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "oidc_provider_arn" {
  description = "IAM OIDC provider ARN for IRSA."
  value       = aws_iam_openid_connect_provider.this.arn
}

output "oidc_issuer_url" {
  description = "Cluster OIDC issuer URL."
  value       = local.oidc_issuer_url
}

output "node_role_arn" {
  description = "IAM role of the managed nodes."
  value       = aws_iam_role.node.arn
}
