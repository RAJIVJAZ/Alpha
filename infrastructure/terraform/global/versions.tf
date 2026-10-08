terraform {
  # 1.10: S3 native state locking (use_lockfile)
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # bucket comes from the bootstrap stack:
  #   terraform init -backend-config="bucket=foodgrid-terraform-state-<account id>"
  # encrypt stays unset so the bucket's default KMS key applies (see bootstrap/main.tf)
  backend "s3" {
    key          = "global/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
  }
}
