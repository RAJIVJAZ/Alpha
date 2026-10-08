variable "domain_names" {
  description = "Host names on the certificate; the first is the subject, the rest are SANs."
  type        = list(string)

  validation {
    condition     = length(var.domain_names) > 0 && length(var.domain_names) == length(distinct(var.domain_names))
    error_message = "domain_names must be a non-empty list without duplicates."
  }
}

variable "route53_zone_id" {
  description = "Hosted zone that receives the DNS validation records."
  type        = string
}

variable "tags" {
  description = "Tags for the certificate."
  type        = map(string)
  default     = {}
}
