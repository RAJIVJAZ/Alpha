# The three Secrets Manager secrets the ExternalSecrets in
# infrastructure/kubernetes read through the ClusterSecretStore:
#   foodgrid/<env>/app      -> foodgrid-secrets          (every service, migrate job)
#   foodgrid/<env>/auth     -> foodgrid-auth-secrets     (auth-service)
#   foodgrid/<env>/payment  -> foodgrid-payment-secrets  (payment-service)
#
# Terraform writes the first version only: values it owns (DATABASE_URL,
# REDIS_URL, generated shared secrets) plus an empty string for every
# third-party credential. Operators then fill those keys out of band (README,
# "Filling the secrets") and Terraform never overwrites the secret again.
# An empty key means "not configured": optional providers stay off, required
# ones (JWT keys, Razorpay in production) make the service fail fast at boot.

resource "aws_kms_key" "this" {
  description             = "${var.name_prefix}: Secrets Manager application secrets"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = var.tags
}

resource "aws_kms_alias" "this" {
  name          = "alias/${replace(var.name_prefix, "/", "-")}-secrets"
  target_key_id = aws_kms_key.this.key_id
}

# shared between services (internal tokens) and the OTP HMAC pepper
resource "random_password" "internal_service_secret" {
  length  = 48
  special = false
}

resource "random_password" "otp_secret" {
  length  = 48
  special = false
}

locals {
  initial_values = {
    app = {
      DATABASE_URL            = var.database_url
      REDIS_URL               = var.redis_url
      INTERNAL_SERVICE_SECRET = random_password.internal_service_secret.result
      # base64 PEM public key from `pnpm keys:generate`; services refuse to start without it
      JWT_PUBLIC_KEY_BASE64      = ""
      FCM_SERVICE_ACCOUNT_BASE64 = ""
      MSG91_AUTH_KEY             = ""
      MSG91_TEMPLATE_ID          = ""
      SMS_SENDER_ID              = ""
      SMS_DLT_ENTITY_ID          = ""
      OPENWEATHER_API_KEY        = ""
    }
    auth = {
      OTP_SECRET             = random_password.otp_secret.result
      JWT_PRIVATE_KEY_BASE64 = ""
      GOOGLE_CLIENT_IDS      = ""
      OTP_TEST_NUMBERS       = ""
    }
    payment = {
      RAZORPAY_KEY_ID         = ""
      RAZORPAY_KEY_SECRET     = ""
      RAZORPAY_WEBHOOK_SECRET = ""
    }
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = toset(["app", "auth", "payment"])

  name                    = "${var.name_prefix}/${each.key}"
  description             = "FoodGrid ${each.key} secrets, synced into Kubernetes by External Secrets"
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = var.recovery_window_days
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "initial" {
  for_each = aws_secretsmanager_secret.this

  secret_id     = each.value.id
  secret_string = jsonencode(local.initial_values[each.key])

  lifecycle {
    # operators own the secret after the first write
    ignore_changes = [secret_string, version_stages]
  }
}
