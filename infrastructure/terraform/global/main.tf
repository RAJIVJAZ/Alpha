# Account-wide pieces shared by staging and production: the ECR repositories
# CD pushes to, the GitHub Actions OIDC provider, the image-push role and the
# optional read-only role for pull-request plans. Apply after bootstrap and
# before envs/*, which look the OIDC provider up.

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "foodgrid"
      Environment = "global"
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  # every image CD builds: infrastructure/docker/service.Dockerfile (SERVICE),
  # web.Dockerfile (APP) and migrate.Dockerfile; must match WORKLOADS in
  # scripts/generate-k8s.ts and the image list in .github/workflows/cd.yml
  services = [
    "auth-service",
    "user-service",
    "order-service",
    "payment-service",
    "inventory-service",
    "procurement-service",
    "delivery-service",
    "supplier-service",
    "analytics-service",
    "ads-service",
    "notification-service",
    "ai-service",
  ]
  web_apps = ["customer-web", "admin-web", "restaurant-web", "supplier-web", "rider-web", "vendor-web"]
  images   = concat(local.services, local.web_apps, ["migrate"])

  github_oidc_host = "token.actions.githubusercontent.com"
  state_bucket     = coalesce(var.state_bucket_name, "foodgrid-terraform-state-${local.account_id}")
}

module "ecr" {
  source = "../modules/ecr"

  repository_names  = local.images
  max_tagged_images = var.max_tagged_images
}

# ─── GitHub Actions OIDC ───────────────────────────────────────────────────
# No thumbprint: IAM trusts GitHub's certificate through its own CA library.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# ─── CI role: build and push images ────────────────────────────────────────
# Only workflows running for main or a v* tag; pull requests (including from
# branches of this repository) cannot push.

data "aws_iam_policy_document" "ci_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "${local.github_oidc_host}:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:ref:refs/tags/v*",
      ]
    }
  }
}

data "aws_iam_policy_document" "ci" {
  # GetAuthorizationToken has no resource-level permissions
  statement {
    sid       = "RegistryLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PushAndInspectFoodgridImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = values(module.ecr.repository_arns)
  }
}

resource "aws_iam_role" "ci" {
  name                 = "foodgrid-github-ci"
  description          = "GitHub Actions (${var.github_repository}, main and v* tags): push images to the foodgrid/* ECR repositories"
  assume_role_policy   = data.aws_iam_policy_document.ci_assume.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "ci" {
  name   = "ecr-push"
  role   = aws_iam_role.ci.id
  policy = data.aws_iam_policy_document.ci.json
}

# ─── Terraform plan role (optional) ────────────────────────────────────────
# Assumed by the plan job of .github/workflows/terraform.yml on pull requests.
# Read-only everywhere (ReadOnlyAccess) plus the state objects; object and
# parameter contents outside the state bucket are denied. Each env stack adds
# read access to the secret versions it wrote and an EKS access entry, when
# its terraform_plan_role_arn is set.

data "aws_kms_alias" "state" {
  count = var.enable_terraform_plan_role ? 1 : 0

  name = "alias/foodgrid-terraform-state"
}

data "aws_iam_policy_document" "plan_assume" {
  count = var.enable_terraform_plan_role ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values   = ["repo:${var.github_repository}:pull_request"]
    }
  }
}

data "aws_iam_policy_document" "plan" {
  count = var.enable_terraform_plan_role ? 1 : 0

  statement {
    sid       = "ListState"
    actions   = ["s3:ListBucket"]
    resources = ["arn:${local.partition}:s3:::${local.state_bucket}"]
  }

  # plans run with -lock=false, so no lock file writes
  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = ["arn:${local.partition}:s3:::${local.state_bucket}/*"]
  }

  statement {
    sid       = "DecryptState"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.state[0].target_key_arn]
  }

  statement {
    sid    = "NoDataReadsOutsideState"
    effect = "Deny"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    not_resources = ["arn:${local.partition}:s3:::${local.state_bucket}/*"]
  }
}

resource "aws_iam_role" "plan" {
  count = var.enable_terraform_plan_role ? 1 : 0

  name                 = "foodgrid-terraform-plan"
  description          = "GitHub Actions pull-request plans of infrastructure/terraform (read-only)"
  assume_role_policy   = data.aws_iam_policy_document.plan_assume[0].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  count = var.enable_terraform_plan_role ? 1 : 0

  role       = aws_iam_role.plan[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state" {
  count = var.enable_terraform_plan_role ? 1 : 0

  name   = "terraform-state"
  role   = aws_iam_role.plan[0].id
  policy = data.aws_iam_policy_document.plan[0].json
}
