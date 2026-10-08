variable "namespace" {
  description = "Repository name prefix; manifests reference image: <namespace>/<name>."
  type        = string
  default     = "foodgrid"
}

variable "repository_names" {
  description = "Image names (without the namespace), one repository each."
  type        = list(string)

  validation {
    condition     = length(var.repository_names) > 0 && length(var.repository_names) == length(distinct(var.repository_names)) && alltrue([for n in var.repository_names : can(regex("^[a-z0-9]+(-[a-z0-9]+)*$", n))])
    error_message = "repository_names must be unique lowercase names such as order-service."
  }
}

variable "max_tagged_images" {
  description = "Tagged images (builds) kept per repository; older ones expire."
  type        = number
  default     = 300

  validation {
    condition     = var.max_tagged_images >= 20
    error_message = "Keep at least 20 builds so production can roll back."
  }
}

variable "untagged_expiry_days" {
  description = "Days before untagged manifests expire."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags for every repository."
  type        = map(string)
  default     = {}
}
