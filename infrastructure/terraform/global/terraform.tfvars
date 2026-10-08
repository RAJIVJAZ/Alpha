# Account-wide settings (no secrets). Defaults live in variables.tf.

region            = "ap-south-1"
github_repository = "RAJIVJAZ/Alpha"

# turn on to let pull requests run `terraform plan` (then set
# terraform_plan_role_arn in envs/*/terraform.tfvars and apply those too)
enable_terraform_plan_role = false
