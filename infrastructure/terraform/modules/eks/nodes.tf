# Managed node groups on Amazon Linux 2023. Each group spans every private app
# subnet (one per AZ); cluster-autoscaler resizes them through the ASG tags EKS
# adds (k8s.io/cluster-autoscaler/<cluster>=owned).

data "aws_iam_policy_document" "node_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${var.cluster_name}-node"
  assume_role_policy = data.aws_iam_policy_document.node_assume.json
  tags               = var.tags
}

# the CNI policy is deliberately absent: aws-node gets it through IRSA (addons.tf)
resource "aws_iam_role_policy_attachment" "node" {
  for_each = merge(
    {
      worker   = "arn:${local.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy"
      ecr_pull = "arn:${local.partition}:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
    },
    var.enable_ssm ? { ssm = "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore" } : {},
  )

  role       = aws_iam_role.node.name
  policy_arn = each.value
}

resource "aws_launch_template" "node" {
  for_each = var.node_groups

  name_prefix            = "${var.cluster_name}-${each.key}-"
  description            = "EKS managed node group ${each.key}"
  update_default_version = true

  # IMDSv2 only; hop limit 1 keeps pods (non-hostNetwork) away from the node role
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = var.node_metadata_hop_limit
    instance_metadata_tags      = "disabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = each.value.disk_size_gb
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  dynamic "tag_specifications" {
    for_each = toset(["instance", "volume", "network-interface"])

    content {
      resource_type = tag_specifications.value
      tags          = merge(var.tags, { Name = "${var.cluster_name}-${each.key}" })
    }
  }

  tags = var.tags
}

resource "aws_eks_node_group" "this" {
  for_each = var.node_groups

  cluster_name           = aws_eks_cluster.this.name
  node_group_name_prefix = "${each.key}-"
  node_role_arn          = aws_iam_role.node.arn
  subnet_ids             = var.subnet_ids
  version                = aws_eks_cluster.this.version
  ami_type               = each.value.ami_type
  capacity_type          = each.value.capacity_type
  instance_types         = each.value.instance_types

  scaling_config {
    min_size     = each.value.min_size
    max_size     = each.value.max_size
    desired_size = each.value.desired_size
  }

  update_config {
    max_unavailable_percentage = 33
  }

  launch_template {
    id      = aws_launch_template.node[each.key].id
    version = aws_launch_template.node[each.key].latest_version
  }

  labels = merge(each.value.labels, { "foodgrid.in/node-group" = each.key })

  dynamic "taint" {
    for_each = each.value.taints

    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  node_repair_config {
    enabled = true
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
    # cluster-autoscaler owns the desired size once the group exists
    ignore_changes = [scaling_config[0].desired_size]
  }

  depends_on = [
    aws_iam_role_policy_attachment.node,
    aws_eks_addon.before_compute,
  ]
}
