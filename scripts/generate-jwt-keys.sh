#!/usr/bin/env bash
# Generates an RS256 key pair for access tokens and writes the base64-encoded
# PEMs into .env (creating it from .env.example if needed).
#
# In Kubernetes these values come from AWS Secrets Manager via External Secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -f "$ENV_FILE" ]] || cp "$ROOT/.env.example" "$ENV_FILE"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$TMP/private.pem" 2>/dev/null
openssl rsa -in "$TMP/private.pem" -pubout -out "$TMP/public.pem" 2>/dev/null

PRIV=$(base64 -w0 < "$TMP/private.pem" 2>/dev/null || base64 < "$TMP/private.pem" | tr -d '\n')
PUB=$(base64 -w0 < "$TMP/public.pem" 2>/dev/null || base64 < "$TMP/public.pem" | tr -d '\n')

upsert() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # use | as delimiter; base64 never contains it
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

upsert JWT_PRIVATE_KEY_BASE64 "$PRIV"
upsert JWT_PUBLIC_KEY_BASE64 "$PUB"
echo "Wrote RS256 key pair to $ENV_FILE"
