terraform {
  # 1.10: S3 native state locking (use_lockfile) in the stacks that use this bucket
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # No backend: this stack creates the bucket every other stack keeps its state
  # in, so its own (small, secret-free) state stays local. See the README.
}
