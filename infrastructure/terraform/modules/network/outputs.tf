output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "VPC CIDR block."
  value       = aws_vpc.this.cidr_block
}

output "azs" {
  description = "Availability zones in use."
  value       = local.azs
}

output "public_subnet_ids" {
  description = "Public subnets (internet-facing ALBs, NAT gateways)."
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "Private application subnets (EKS nodes and pods, internal ALBs)."
  value       = aws_subnet.private_app[*].id
}

output "private_data_subnet_ids" {
  description = "Private data subnets (RDS, ElastiCache)."
  value       = aws_subnet.private_data[*].id
}

output "nat_public_ips" {
  description = "Egress IPs of the NAT gateways (allow-list these at third parties such as Razorpay or MSG91)."
  value       = aws_eip.nat[*].public_ip
}
