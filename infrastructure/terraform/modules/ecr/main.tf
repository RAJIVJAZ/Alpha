# One private repository per image CD builds: foodgrid/<service>, foodgrid/<web
# app> and foodgrid/migrate. Tags are full commit SHAs and never move, so the
# repositories are immutable and CD skips images that are already pushed.

resource "aws_ecr_repository" "this" {
  for_each = toset(var.repository_names)

  name                 = "${var.namespace}/${each.value}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  encryption_configuration {
    # AWS managed key: nodes and CI pull without extra KMS permissions
    encryption_type = "KMS"
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

# Untagged manifests are build leftovers (an image index's children become
# untagged once the index expires; ECR never deletes a manifest an index still
# references). Production promotes images that staging already ran, so keep a
# deep history of tagged builds.
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged manifests after ${var.untagged_expiry_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.untagged_expiry_days
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the ${var.max_tagged_images} most recent builds"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = var.max_tagged_images
        }
        action = { type = "expire" }
      },
    ]
  })
}
