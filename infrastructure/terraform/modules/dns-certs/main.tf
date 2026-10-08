# Edge pieces the ALB ingress needs: the ACM certificate for every ingress
# host, the WAF web ACL (production), and once the AWS Load Balancer
# Controller has created the ALB, Route53 aliases for the hosts.

data "aws_route53_zone" "this" {
  name         = var.route53_zone_name
  private_zone = false
}

module "certificate" {
  source = "../acm-certificate"

  domain_names    = var.hostnames
  route53_zone_id = data.aws_route53_zone.this.zone_id
  tags            = var.tags
}

# The ALB exists only after the first deploy of the overlay; flip
# create_alb_records once it does (README, "DNS for the ingress hosts").
data "aws_lb" "ingress" {
  count = var.create_alb_records ? 1 : 0

  tags = {
    "elbv2.k8s.aws/cluster" = var.cluster_name
    "ingress.k8s.aws/stack" = var.ingress_group_name
  }
}

resource "aws_route53_record" "ingress" {
  for_each = var.create_alb_records ? toset(var.hostnames) : toset([])

  zone_id = data.aws_route53_zone.this.zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = data.aws_lb.ingress[0].dns_name
    zone_id                = data.aws_lb.ingress[0].zone_id
    evaluate_target_health = true
  }
}
