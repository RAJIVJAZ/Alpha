output "state_bucket_name" {
  description = "State bucket: pass it to every other stack with terraform init -backend-config=\"bucket=<name>\", and set it as the TF_STATE_BUCKET repository variable for the plan job."
  value       = aws_s3_bucket.state.id
}

output "state_bucket_region" {
  description = "Region of the state bucket."
  value       = var.region
}

output "state_kms_key_arn" {
  description = "KMS key encrypting the state objects."
  value       = aws_kms_key.state.arn
}

output "init_command" {
  description = "terraform init for the global and envs/* stacks."
  value       = "terraform init -backend-config=\"bucket=${aws_s3_bucket.state.id}\""
}
