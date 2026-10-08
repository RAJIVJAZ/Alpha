#!/usr/bin/env bash
# Renders a Kustomize overlay exactly as CD deploys it, on a temporary copy so the
# checkout is never modified:
#   - the deploy-time placeholders (ACCOUNT_ID, STAGING_CERT_ID / PRODUCTION_CERT_ID,
#     WAF_ID) are filled from the GitHub environment variables, and
#   - every foodgrid/<name> image is pinned with
#     `kustomize edit set image foodgrid/<name>=$ECR_REGISTRY/foodgrid/<name>:$IMAGE_TAG`.
#
#   ECR_REGISTRY=<account>.dkr.ecr.<region>.amazonaws.com IMAGE_TAG=<commit sha> \
#   AWS_ACCOUNT_ID=<account> ACM_CERTIFICATE_ID=<uuid> WAF_WEB_ACL_ID=<uuid, production> \
#     .github/scripts/render-overlay.sh <staging|production> <out-dir>
#
# Writes to <out-dir>:
#   app.yaml      the whole overlay (applied after the migration)
#   migrate.yaml  the db-migrate Job (overlays/<env>/migrate)
#   prereqs.yaml  Namespace + ExternalSecrets from app.yaml, applied before the migration
#                 so the Job's foodgrid-secrets Secret exists on a fresh cluster
#   images.txt    the pinned image references
#   src/          the edited copy of infrastructure/{kubernetes,monitoring}
# and fails if a placeholder or an unpinned foodgrid/ image is left in the output.
set -euo pipefail

fail() {
  echo "::error::$*" >&2
  exit 1
}

usage='usage: render-overlay.sh <staging|production> <out-dir>'
env_name=${1:?$usage}
out=${2:?$usage}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

uuid='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
[[ ${ECR_REGISTRY:-} =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$ ]] ||
  fail "ECR_REGISTRY must look like <account>.dkr.ecr.<region>.amazonaws.com (got '${ECR_REGISTRY:-}')"
[[ ${IMAGE_TAG:-} =~ ^[0-9a-f]{40}$ ]] ||
  fail "IMAGE_TAG must be a full 40-character commit SHA (got '${IMAGE_TAG:-}')"
[[ ${AWS_ACCOUNT_ID:-} =~ ^[0-9]{12}$ ]] ||
  fail "AWS_ACCOUNT_ID must be a 12-digit account id (got '${AWS_ACCOUNT_ID:-}')"
[[ ${ACM_CERTIFICATE_ID:-} =~ $uuid ]] ||
  fail "ACM_CERTIFICATE_ID must be the certificate id after 'certificate/' (got '${ACM_CERTIFICATE_ID:-}')"

case $env_name in
  staging) cert_placeholder=STAGING_CERT_ID ;;
  production)
    cert_placeholder=PRODUCTION_CERT_ID
    [[ ${WAF_WEB_ACL_ID:-} =~ $uuid ]] ||
      fail "WAF_WEB_ACL_ID must be the id of the foodgrid-production web ACL (got '${WAF_WEB_ACL_ID:-}')"
    ;;
  *) fail "$usage" ;;
esac

src=$out/src
rm -rf "$src"
mkdir -p "$src/infrastructure"
# the overlays reach ../../base and ../../../monitoring, so both trees keep their layout
cp -R "$root/infrastructure/kubernetes" "$root/infrastructure/monitoring" "$src/infrastructure/"
overlay=$src/infrastructure/kubernetes/overlays/$env_name
[[ -f $overlay/kustomization.yaml && -f $overlay/migrate/kustomization.yaml ]] ||
  fail "overlay $env_name (with migrate/) not found under infrastructure/kubernetes/overlays"

substitutions=(-e "s/\bACCOUNT_ID\b/$AWS_ACCOUNT_ID/g" -e "s/\b$cert_placeholder\b/$ACM_CERTIFICATE_ID/g")
if [[ -n ${WAF_WEB_ACL_ID:-} ]]; then
  substitutions+=(-e "s/\bWAF_ID\b/$WAF_WEB_ACL_ID/g")
fi
find "$overlay" -type f -name '*.yaml' -exec sed -i -E "${substitutions[@]}" {} +

# pin whatever foodgrid/* images the kustomization renders, so a workload added to
# scripts/generate-k8s.ts is picked up without editing this script
pin_images() {
  local dir=$1 name
  while read -r name; do
    (cd "$dir" && kustomize edit set image "foodgrid/$name=$ECR_REGISTRY/foodgrid/$name:$IMAGE_TAG")
  done < <(kustomize build "$dir" | grep -oE 'image: foodgrid/[a-z0-9-]+' | cut -d/ -f2 | sort -u)
}
pin_images "$overlay"
pin_images "$overlay/migrate"

kustomize build "$overlay" > "$out/app.yaml"
kustomize build "$overlay/migrate" > "$out/migrate.yaml"

# kustomize prints top-level keys at column 0 and separates documents with ---
awk '
  function flush() {
    if (keep) printf "---\n%s", doc
    doc = ""
    keep = 0
  }
  /^---$/ { flush(); next }
  { doc = doc $0 "\n" }
  /^kind: (Namespace|ExternalSecret)$/ { keep = 1 }
  END { flush() }
' "$out/app.yaml" > "$out/prereqs.yaml"

rendered=("$out/app.yaml" "$out/migrate.yaml" "$out/prereqs.yaml")
if grep -nE '\b(ACCOUNT_ID|STAGING_CERT_ID|PRODUCTION_CERT_ID|WAF_ID)\b' "${rendered[@]}"; then
  fail "placeholders left in the rendered $env_name manifests (see above)"
fi
if grep -nE 'image: foodgrid/' "${rendered[@]}"; then
  fail "unpinned foodgrid/ images left in the rendered $env_name manifests (see above)"
fi
grep -qx 'kind: Job' "$out/migrate.yaml" || fail "migrate.yaml has no Job"
grep -qx 'kind: Namespace' "$out/prereqs.yaml" || fail "prereqs.yaml has no Namespace"

grep -ohE "image: $ECR_REGISTRY/foodgrid/[a-z0-9-]+:$IMAGE_TAG" "$out/app.yaml" "$out/migrate.yaml" |
  cut -d' ' -f2 | sort -u > "$out/images.txt"
echo "Rendered $env_name: $(wc -l < "$out/images.txt") images pinned to $IMAGE_TAG"
