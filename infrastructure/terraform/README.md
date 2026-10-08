# FoodGrid on AWS (Terraform)

Everything FoodGrid needs in AWS, except what is listed under
[Deliberately manual](#deliberately-manual): the container registry, the GitHub
Actions roles, and per environment (staging, production) a VPC, an EKS cluster
with its add-ons, PostgreSQL, Valkey, the media bucket behind CloudFront,
certificates, WAF and the Secrets Manager secrets the Kubernetes overlays read.

Region `ap-south-1` (Mumbai); CloudFront certificates are issued in `us-east-1`.
Only `hashicorp/*` providers and local modules are used, so everything validates
offline.

## Layout

```
bootstrap/          S3 state bucket (versioned, KMS, TLS only); local state
global/             ECR repositories, GitHub OIDC provider, CI push role, optional plan role
envs/staging/       thin root: providers + sizing, calls modules/environment
envs/production/    same, production sizing
modules/
  environment/      one whole environment, composed from the modules below
  network/          VPC, 3 AZs x public / private-app / private-data subnets, NAT, endpoints, flow logs
  eks/              cluster (API auth, KMS secrets encryption, logging), node groups, core add-ons, IRSA provider
  addons/           Helm: AWS Load Balancer Controller, External Secrets + ClusterSecretStore,
                    metrics-server, cluster-autoscaler, kube-prometheus-stack, Fluent Bit; RBAC
  database/         RDS PostgreSQL 16 (matches infrastructure/docker/docker-compose.yml)
  cache/            ElastiCache Valkey, TLS + AUTH, rediss://
  storage/          media bucket + CloudFront (Origin Access Control)
  dns-certs/        ALB certificate, WAF web ACL, Route53 aliases for the ingress hosts
  acm-certificate/  DNS-validated ACM certificate (used for the ALB and, in us-east-1, the CDN)
  app-secrets/      Secrets Manager foodgrid/<env>/{app,auth,payment}
  iam/              foodgrid-<env>-app (IRSA) and foodgrid-<env>-deploy (GitHub environment) roles
  irsa-role/        IAM role for a Kubernetes service account
  ecr/              foodgrid/<image> repositories
  observability/    KMS key for logs and alarms, SNS alarm topic
```

Every name the manifests use is fixed here: namespace `foodgrid`, service account
`foodgrid-app` -> role `foodgrid-<env>-app`, ClusterSecretStore `aws-secrets-manager`,
secrets `foodgrid/<env>/*`, bucket `foodgrid-<env>-media`, CDN host
`cdn[.staging].foodgrid.in`, ALB ingress group `foodgrid`, WAF ACL
`foodgrid-production`, clusters `foodgrid-staging` / `foodgrid-production`.

## Before you start

- Terraform >= 1.10 (CI uses 1.16.5), AWS CLI v2 and `jq`. The env stacks run
  `aws eks get-token` to talk to the new cluster.
- Administrator credentials for the account. Whoever first applies an env stack
  becomes cluster admin through EKS; add other operators to
  `cluster_admin_principal_arns`.
- A public Route53 hosted zone `foodgrid.in`, delegated from the registrar.
  Terraform looks it up by name and adds records; it never creates the zone.

## Apply order: bootstrap -> global -> envs

1. **bootstrap** (once, local state):

   ```sh
   cd infrastructure/terraform/bootstrap
   terraform init && terraform apply
   terraform output state_bucket_name   # foodgrid-terraform-state-<account id>
   ```

   Its state is small, holds no secrets and stays on your machine; keep a copy
   (if it is lost, `terraform import aws_s3_bucket.state <bucket>` and friends,
   or just leave the bucket alone: it has `prevent_destroy`).

2. **global** and then each env use that bucket. The backend blocks hold the key
   (`global/terraform.tfstate`, `envs/<env>/terraform.tfstate`) and S3 native
   locking (`use_lockfile = true`, no DynamoDB); the bucket is passed at init:

   ```sh
   cd ../global
   terraform init -backend-config="bucket=foodgrid-terraform-state-<account id>"
   terraform apply
   ```

3. **envs/staging**, then **envs/production** (same commands). One apply builds
   the network, the cluster, the nodes and then the in-cluster add-ons (the helm
   and kubernetes providers are configured from the cluster it just created);
   expect 30-40 minutes. Then:
   - copy the GitHub variables ([below](#github-variables-and-overlay-placeholders)),
   - [fill the secrets](#filling-the-secrets),
   - run the [database bootstrap](#database-bootstrap),
   - deploy (CD), then turn on [DNS for the ingress hosts](#dns-for-the-ingress-hosts).

   If the cluster ever has to be replaced, apply `-target=module.environment.module.eks`
   first: the helm and kubernetes providers cannot reach a cluster that does not exist yet.

Each root has a `terraform.tfvars` with the operator settings (alarm emails,
admin roles, API endpoint CIDRs, plan role, DNS switch); per-environment sizing
is in its `main.tf`.

## GitHub variables and overlay placeholders

Both `global` and each env output `github_variables`, a map with exactly the
names the workflows read. Copy them with the GitHub CLI:

```sh
terraform -chdir=global output -json github_variables |
  jq -r 'to_entries[] | select(.value != "") | "\(.key)\t\(.value)"' |
  while IFS=$'\t' read -r k v; do gh variable set "$k" --body "$v"; done

for env in staging production; do
  terraform -chdir=envs/$env output -json github_variables |
    jq -r 'to_entries[] | "\(.key)\t\(.value)"' |
    while IFS=$'\t' read -r k v; do gh variable set "$k" --env "$env" --body "$v"; done
done
```

| Variable                      | Scope                                | Stack / output                         |
| ----------------------------- | ------------------------------------ | -------------------------------------- |
| `AWS_REGION`                  | repository                           | global `github_variables`              |
| `AWS_ACCOUNT_ID`              | repository                           | global `github_variables`              |
| `ECR_REGISTRY`                | repository                           | global `github_variables`              |
| `AWS_CI_ROLE_ARN`             | repository                           | global `github_variables`              |
| `AWS_TERRAFORM_PLAN_ROLE_ARN` | repository, optional                 | global `github_variables` (empty: off) |
| `TF_STATE_BUCKET`             | repository, only with the plan role  | bootstrap `state_bucket_name`          |
| `EKS_CLUSTER_NAME`            | environment `staging` / `production` | envs/&lt;env&gt; `github_variables`    |
| `AWS_DEPLOY_ROLE_ARN`         | environment `staging` / `production` | envs/&lt;env&gt; `github_variables`    |
| `ACM_CERTIFICATE_ID`          | environment `staging` / `production` | envs/&lt;env&gt; `github_variables`    |
| `WAF_WEB_ACL_ID`              | environment `production`             | envs/production `github_variables`     |

CD substitutes the overlay placeholders from those variables:

| Placeholder in overlays/&lt;env&gt;      | Variable             | Created by                                     |
| ---------------------------------------- | -------------------- | ---------------------------------------------- |
| `ACCOUNT_ID`                             | `AWS_ACCOUNT_ID`     | the account (role ARNs, certificate ARN)       |
| `STAGING_CERT_ID` / `PRODUCTION_CERT_ID` | `ACM_CERTIFICATE_ID` | `modules/dns-certs` (id after `certificate/`)  |
| `WAF_ID` (production)                    | `WAF_WEB_ACL_ID`     | `modules/dns-certs`, ACL `foodgrid-production` |

`terraform output overlay_values` lists what each placeholder and hard-coded
overlay name resolves to in that environment, to check an overlay against the stack.

Trust: the CI role accepts only `refs/heads/main` and `refs/tags/v*` of
`RAJIVJAZ/Alpha` (no pull requests); each deploy role only jobs in the GitHub
environment of the same name, and it can do no more than `eks:DescribeCluster`
plus the Kubernetes RBAC of `modules/addons/rbac.tf` (apply the overlay in
`foodgrid`, no Secrets). The plan role (`enable_terraform_plan_role` in global)
is assumable from pull requests of the repository and is read-only; each env
lets it read back only the secret versions Terraform wrote. After turning it on,
put its ARN in `terraform_plan_role_arn` of both envs and apply them.

## Filling the secrets

The ExternalSecrets copy `foodgrid/<env>/app`, `/auth` and `/payment` into
`foodgrid-secrets`, `foodgrid-auth-secrets` and `foodgrid-payment-secrets`.
Terraform writes the first version of each with every key the services read
(`.env.example`, the services' config) and never touches the value again
(`ignore_changes`), so operator edits stick.

| Secret    | Written by Terraform                                   | Fill in yourself                                                                                                                                                     |
| --------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`     | `DATABASE_URL`, `REDIS_URL`, `INTERNAL_SERVICE_SECRET` | `JWT_PUBLIC_KEY_BASE64` (required), `FCM_SERVICE_ACCOUNT_BASE64`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `SMS_SENDER_ID`, `SMS_DLT_ENTITY_ID`, `OPENWEATHER_API_KEY` |
| `auth`    | `OTP_SECRET`                                           | `JWT_PRIVATE_KEY_BASE64` (required), `GOOGLE_CLIENT_IDS`; keep `OTP_TEST_NUMBERS` empty in production                                                                |
| `payment` | -                                                      | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`                                                                                                  |

`DATABASE_URL` uses the `foodgrid_app` role with a Terraform-generated password
(`?schema=public&sslmode=require`; RDS forces TLS); `REDIS_URL` is
`rediss://:<AUTH token>@<primary endpoint>:6379`. Both are in the Terraform
state, as is every generated credential: the state bucket is KMS-encrypted and
should stay readable by administrators only. Outputs never contain them.

Merge values in without retyping the rest (the services refuse to start
without the JWT keys):

```sh
ENV=staging
tmp=$(mktemp -d)
update() { # update <app|auth|payment> <jq filter> [jq --arg ...]
  local id=foodgrid/$ENV/$1 filter=$2; shift 2
  aws secretsmanager get-secret-value --secret-id "$id" --query SecretString --output text |
    jq -c "$@" "$filter" > "$tmp/secret.json"
  aws secretsmanager put-secret-value --secret-id "$id" --secret-string "file://$tmp/secret.json"
}

bash scripts/generate-jwt-keys.sh "$tmp/jwt.env"   # one RS256 pair per environment
update app  '.JWT_PUBLIC_KEY_BASE64 = $k'  --arg k "$(sed -n 's/^JWT_PUBLIC_KEY_BASE64=//p' "$tmp/jwt.env")"
update auth '.JWT_PRIVATE_KEY_BASE64 = $k' --arg k "$(sed -n 's/^JWT_PRIVATE_KEY_BASE64=//p' "$tmp/jwt.env")"
update payment '.RAZORPAY_KEY_ID = $id | .RAZORPAY_KEY_SECRET = $s | .RAZORPAY_WEBHOOK_SECRET = $w' \
  --arg id rzp_live_xxx --arg s '...' --arg w '...'
rm -rf "$tmp"
```

External Secrets refreshes hourly; to pick a change up now:
`kubectl -n foodgrid annotate externalsecret --all force-sync=$(date +%s) --overwrite`,
then `kubectl -n foodgrid rollout restart deployment`.

If the database or cache endpoint ever changes (restore from a snapshot), update
`DATABASE_URL` / `REDIS_URL` the same way: Terraform will not rewrite them.

## Database bootstrap

The services and the migration Job connect as `foodgrid_app`, which owns the
`foodgrid` database (Prisma creates the schemas and the trusted `pg_trgm`
extension). The master user `foodgrid_admin` has an RDS-managed, rotated
password and is only used for this one-time step, from a pod inside the cluster
(the database accepts connections only from the cluster security group):

```sh
ENV=staging
terraform -chdir=envs/$ENV output -json environment |
  jq -r '.database_endpoint, .database_master_secret_arn'
# master password
aws secretsmanager get-secret-value --secret-id <database_master_secret_arn> \
  --query SecretString --output text | jq -r .password
# foodgrid_app password: the part of DATABASE_URL between "foodgrid_app:" and "@"
aws secretsmanager get-secret-value --secret-id foodgrid/$ENV/app \
  --query SecretString --output text | jq -r .DATABASE_URL

kubectl run psql --rm -it --restart=Never -n default --image=postgres:16-alpine \
  --env=PGHOST=<endpoint host> --env=PGUSER=foodgrid_admin --env=PGDATABASE=foodgrid \
  --env=PGSSLMODE=require -- psql
```

```sql
CREATE ROLE foodgrid_app LOGIN;
\password foodgrid_app
GRANT foodgrid_app TO foodgrid_admin;   -- PostgreSQL 16: needed to hand over ownership
ALTER DATABASE foodgrid OWNER TO foodgrid_app;
```

## DNS for the ingress hosts

The AWS Load Balancer Controller creates the ALB (one, ingress group `foodgrid`)
on the first deploy. Then set `create_alb_dns_records = true` in that env's
`terraform.tfvars` and apply: Terraform aliases every ingress host to it. The CDN
host (`cdn.foodgrid.in`, `cdn.staging.foodgrid.in`) and the certificate
validation records are created from the start.

## Rotating generated credentials

- **Valkey AUTH token**: `aws elasticache modify-replication-group --replication-group-id foodgrid-<env> --auth-token <new> --auth-token-update-strategy ROTATE --apply-immediately`,
  update `REDIS_URL`, restart the deployments, then repeat with `--auth-token-update-strategy SET`.
  Terraform ignores `auth_token` after creation.
- **foodgrid_app password**: `\password foodgrid_app` as the master user, update
  `DATABASE_URL`, restart.

## Validation

What CI (`.github/workflows/terraform.yml`) and a reviewer run, offline:

```sh
terraform fmt -check -recursive infrastructure/terraform
for d in bootstrap global envs/staging envs/production; do
  terraform -chdir=infrastructure/terraform/$d init -backend=false
  terraform -chdir=infrastructure/terraform/$d validate
done
```

The roots keep their `.terraform.lock.hcl`, so every machine uses the same
provider builds. `modules/environment` declares the `aws.us_east_1` alias, so it
validates only through the env roots. Helm chart versions are pinned in
`modules/addons/variables.tf`; bump them deliberately.

## Cost notes

Rough drivers, per month, list prices (check the AWS Pricing Calculator):

- **EKS control plane**: about USD 73 per cluster; two clusters.
- **Nodes**: staging 2 x t3.large on-demand (system) + 2 Spot 2 vCPU/8 GiB (app);
  production 3 x m6i.large + 3 x m6i.xlarge on-demand, autoscaling to 12 app nodes.
- **NAT gateways**: hourly plus per GB; staging has one, production one per AZ.
  The S3 gateway endpoint and the interface endpoints (ECR, STS, Secrets Manager,
  Logs) keep image pulls and log shipping off NAT; they cost hourly per AZ
  (staging places them in one AZ, production in three).
- **RDS**: production is Multi-AZ (twice the instance price), staging single-AZ
  db.t4g.medium. Storage autoscales up to the configured ceiling.
- **ElastiCache**: production two cache.r6g.large nodes, staging one cache.t4g.small.
- **CloudWatch Logs** is the usual surprise: container logs, VPC flow logs (ALL)
  and EKS audit logs. Lower `log_retention_days` or the flow log traffic type if needed.
- **WAF** (production): per web ACL, per rule and per million requests.
- **CloudFront** uses `PriceClass_200`, the cheapest class with Indian edge locations.
- Six customer-managed KMS keys per environment (USD 1 each).

Staging can be destroyed and recreated cheaply (no deletion protection, no
final database snapshot); see [Teardown](#teardown).

## Deliberately manual

- The Route53 hosted zone and its delegation at the registrar.
- SES: verify `foodgrid.in` (DKIM) and request production access; the app role
  may only send as `no-reply@foodgrid.in`.
- Third-party credentials in Secrets Manager (above) and the database role.
- GitHub: the repository variables, the `staging` / `production` environments
  and their protection rules (required reviewers for production).
- Turning on `create_alb_dns_records` after the first deploy.
- The admin ingress allow-list (`alb.ingress.kubernetes.io/inbound-cidrs` in the
  overlays) and the API endpoint CIDRs (`cluster_public_access_cidrs`): both
  depend on your office or VPN addresses.
- Confirming the alarm topic's email subscriptions.
- Kubernetes upgrades: raise `kubernetes_version` one minor at a time; the
  managed add-ons and the cluster-autoscaler image follow it.
- Third-party allow-lists (Razorpay, MSG91) for the NAT egress IPs:
  `terraform output -json environment | jq .nat_public_ips`.

## Teardown

1. `kubectl delete ingress -n foodgrid --all` so the controller removes the ALB
   and its security groups, then set `create_alb_dns_records = false` and apply.
2. Production only: turn off deletion protection (`cluster_deletion_protection`,
   `database.deletion_protection` in `main.tf`). The validations in
   `modules/environment/variables.tf` refuse that for production on purpose, so
   it takes a deliberate code change there too.
3. Empty the media bucket (all object versions), then `terraform destroy`.
4. Secrets Manager keeps deleted secrets for the recovery window (7 days in
   staging, 30 in production); recreating the environment sooner needs
   `aws secretsmanager restore-secret` or a forced delete.
