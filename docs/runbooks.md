# Runbooks

What to do when a FoodGrid alert fires, and the procedures that come up during
incidents. The alert rules live in `infrastructure/monitoring/prometheus-rules.yaml`;
each links to its section here. Alertmanager sends every alert to the environment's SNS
alarm topic (the addresses in `alarm_emails` in
`infrastructure/terraform/envs/<env>/terraform.tfvars`).

Alerts: [Service down](#service-down) · [High error rate](#high-error-rate) ·
[Slow responses](#slow-responses) · [Payment failures](#payment-failures) ·
[Orders dropped](#orders-dropped) · [Rider supply](#rider-supply) ·
[Event consumer errors](#event-consumer-errors) · [Other alerts](#other-alerts)

Procedures: [Rolling back a deploy](#rolling-back-a-deploy) ·
[Re-running the migration job](#re-running-the-migration-job) ·
[Rotating JWT keys and secrets](#rotating-jwt-keys-and-secrets) ·
[Draining the outbox](#draining-the-outbox) ·
[Replaying a stuck consumer group](#replaying-a-stuck-consumer-group) ·
[Rider cash reconciliation](#rider-cash-reconciliation)

## Tools

You need cluster-admin access to the environment's EKS cluster (an ARN in
`cluster_admin_principal_arns`); the GitHub deploy role cannot read Secrets.

```sh
ENV=production   # or staging
aws eks update-kubeconfig --name foodgrid-$ENV --region ap-south-1
kubectl -n foodgrid get deploy,pods,hpa

# Prometheus (http://localhost:9090) and Grafana (http://localhost:3000, dashboard
# "FoodGrid — platform overview"; user admin, password in secret monitoring/grafana-admin)
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d

# Logs of one service (JSON lines; pino level 50 = error, 40 = warn)
kubectl -n foodgrid logs -l app.kubernetes.io/name=order-service --since=15m --tail=-1 --prefix |
  grep '"level":50'
```

Older logs are in CloudWatch Logs, group `/aws/eks/foodgrid-<env>/containers`, one
stream per container named `foodgrid.<pod>.<container>`. A Logs Insights query for
errors of one service:

```
fields @timestamp, @logStream, @message
| filter @logStream like /^foodgrid\.order-service-/ and @message like /level\W+50\b/
| sort @timestamp desc
| limit 100
```

**psql** as the application role, from a throwaway pod (the database accepts
connections only from inside the cluster; the URL is read from the Secret inside the pod,
so it never appears in the pod spec):

```sh
kubectl -n foodgrid run psql --rm -it --restart=Never --image=postgres:16-alpine \
  --overrides='{"spec":{"containers":[{"name":"psql","image":"postgres:16-alpine","stdin":true,"tty":true,"envFrom":[{"secretRef":{"name":"foodgrid-secrets"}}],"command":["sh","-c","exec psql \"${DATABASE_URL%%\\?*}?sslmode=require\""]}]}}'
```

**Redis commands** without installing anything: every service pod has Node.js, ioredis
and `REDIS_URL` (TLS and AUTH included).

```sh
rcmd() {
  kubectl -n foodgrid exec -i deploy/order-service -- node -e '
    const R = require("ioredis"); const r = new R(process.env.REDIS_URL);
    r.call(...process.argv.slice(1)).then((x) => console.log(JSON.stringify(x, null, 1)))
      .catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => r.quit());
  ' "$@"
}
rcmd XINFO GROUPS events:order
```

**Admin API calls** as a back-office user (ADMIN, OPS or FINANCE, depending on the
route); the access token lasts 15 minutes:

```sh
API=https://api.foodgrid.in/api/v1   # staging: https://api.staging.foodgrid.in/api/v1
TOKEN=$(curl -s "$API/auth/password" -H 'content-type: application/json' \
  -d '{"email": "you@foodgrid.in", "password": "..."}' | jq -r .tokens.accessToken)
curl -s "$API/admin/rider-cash" -H "authorization: Bearer $TOKEN" | jq
```

**Health of one pod**, from inside it: `kubectl -n foodgrid exec deploy/order-service -- wget -qO- http://127.0.0.1:4003/health/ready`
(ports: auth 4001, user 4002, order 4003, payment 4004, inventory 4005, procurement 4006,
delivery 4007, supplier 4008, analytics 4009, ads 4010, notification 4011, ai 4012).

## Service down

**Fires when** `up{namespace="foodgrid"} == 0` for 2 minutes (critical): Prometheus
cannot scrape `/metrics` of a FoodGrid service pod. The labels `service` and `pod` name
it.

**Impact** depends on the service:

| Service                                              | What stops                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auth-service                                         | sign-in and token refresh; users drop out as access tokens expire (15 min)                                                                             |
| user-service                                         | profiles, addresses, onboarding, approvals, media uploads; notification-service cannot look up recipients                                              |
| order-service                                        | browsing, cart, checkout, merchant order handling; payment intents (amount look-up)                                                                    |
| payment-service                                      | online and wallet payments, refunds; unpaid orders auto-cancel after 15 minutes                                                                        |
| delivery-service                                     | dispatch, rider apps, live tracking; accepted orders wait for a rider                                                                                  |
| notification-service                                 | push, email and **OTP SMS** (new sign-ins fail)                                                                                                        |
| inventory, procurement, supplier, analytics, ads, ai | their own screens; event-driven work queues up and catches up on recovery; checkout skips fraud scoring and sponsored listings when ai or ads are down |

**First checks**

```sh
kubectl -n foodgrid get pods -l app.kubernetes.io/name=<service> -o wide
kubectl -n foodgrid describe pod <pod>              # Last State, Reason (OOMKilled?), Events
kubectl -n foodgrid logs <pod> --previous --tail=100 # why the last container exited
kubectl -n foodgrid get events --sort-by=.lastTimestamp | tail -30
kubectl -n foodgrid get externalsecret              # all Ready?
kubectl get nodes
```

PromQL: `up{namespace="foodgrid"} == 0` (which pods),
`kube_pod_container_status_restarts_total{namespace="foodgrid"}`.

**Likely causes**

- Crash loop at boot: `Invalid environment configuration` lists the missing variable
  (a key missing from `foodgrid/<env>/*`, or an ExternalSecret not synced).
- `OOMKilled`: memory limit too low for the load.
- A bad release (the pods started failing right after a deploy).
- Every service down at once: the `monitoring` namespace lost access (NetworkPolicy
  `allow-metrics-scrape`), or the nodes are gone.

**Mitigation**

- Bad release: [roll back](#rolling-back-a-deploy).
- Missing secret: fill it (see [deployment.md](./deployment.md#secrets)), force-sync,
  restart: `kubectl -n foodgrid annotate externalsecret --all force-sync=$(date +%s) --overwrite`
  then `kubectl -n foodgrid rollout restart deployment/<service>`.
- OOM: raise the limit for that workload in `scripts/generate-k8s.ts` (`WORKLOADS`),
  `pnpm k8s:generate`, merge and deploy. In an emergency
  `kubectl -n foodgrid set resources deployment/<service> --limits=memory=1Gi` (the next
  deploy reverts it).

**Escalation**: page the on-call backend engineer if the pod does not recover within
15 minutes or more than one service is down; involve the platform owner for node or
network problems.

## High error rate

**Fires when** `service:http_errors:ratio5m > 0.05 and service:http_requests:rate5m > 0.5`
for 5 minutes (critical): more than 5 % of a service's requests answer 5xx while it
serves more than 0.5 requests per second. The recording rules are built from
`http_request_duration_seconds_count`; 4xx responses do not count.

**Impact**: users see "something went wrong" on the screens backed by that service;
on order-service or payment-service, lost orders.

**First checks**

```promql
# which routes fail
topk(10, sum by (route, status) (rate(http_request_duration_seconds_count{service="order-service", status=~"5.."}[5m])))
# did it start with a deploy? (pods younger than the alert)
kube_pod_start_time{namespace="foodgrid"}
```

```sh
kubectl -n foodgrid logs -l app.kubernetes.io/name=<service> --since=15m --tail=-1 --prefix | grep '"level":50' | tail -20
# a dependency failing shows as UPSTREAM_ERROR / UPSTREAM_UNAVAILABLE and "<METHOD> <service>/api/v1/... failed"
kubectl -n foodgrid logs -l app.kubernetes.io/name=<service> --since=15m --tail=-1 | grep -E 'UPSTREAM_|failed:' | tail -20
```

**Likely causes**

- A bad release.
- A dependency: another service down (503 `UPSTREAM_UNAVAILABLE` from
  `InternalHttpService`), PostgreSQL (Prisma `P1001` cannot reach, `P2024` pool timeout)
  or Redis (readiness fails as well).
- A third party: Razorpay (payment-service), SMS or push providers
  (notification-service).

**Mitigation**: roll back a bad release; restore the failing dependency (see that
service's runbook); for database saturation see [slow responses](#slow-responses).

**Escalation**: on-call backend engineer immediately for order-service, payment-service
and auth-service; for a third-party outage, open a ticket with the provider.

## Slow responses

**Fires when** `service:http_latency:p95_5m > 1` for 10 minutes (warning): the 95th
percentile latency of a service is above one second.

**Impact**: slow screens; checkout and payment calls can time out in clients
(service-to-service calls time out after 5 s, the delivery quote and fraud score after
800 ms and fall back).

**First checks**

```promql
# slowest routes
topk(10, histogram_quantile(0.95, sum by (route, le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m]))))
# CPU saturation and replicas
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="foodgrid", container="app"}[5m]))
kube_horizontalpodautoscaler_status_current_replicas{namespace="foodgrid"}
# event loop
max by (service) (nodejs_eventloop_lag_p99_seconds)
```

```sql
-- long-running queries (psql, see Tools)
SELECT pid, now() - query_start AS running, state, wait_event_type, left(query, 120)
FROM pg_stat_activity
WHERE datname = 'foodgrid' AND state <> 'idle'
ORDER BY running DESC LIMIT 20;
```

**Likely causes**: the HPA at its ceiling (see [other alerts](#other-alerts)); a slow
query after a data or code change; database CPU or connections exhausted; a slow
dependency on the request path; a blocked event loop (CPU-heavy work in a request).

**Mitigation**: scale the deployment if CPU bound
(`kubectl -n foodgrid scale deployment/<service> --replicas=<n>` while below the HPA
maximum, or raise `maxReplicas` in `scripts/generate-k8s.ts`); cancel a runaway query with
`SELECT pg_cancel_backend(<pid>);`; add the missing index in a migration; roll back if a
release caused it.

**Escalation**: on-call backend engineer if it lasts 30 minutes or reaches checkout or
payments.

## Payment failures

**Fires when** (critical, for 10 minutes)

```promql
sum(rate(payments_failed_total[10m]))
  / clamp_min(sum(rate(payments_captured_total[10m])) + sum(rate(payments_failed_total[10m])), 1e-9) > 0.15
and sum(rate(payments_failed_total[10m])) > 0.01
```

More than 15 % of finished payments fail, at more than one failure every 100 s.
Failures are payments Razorpay reports as failed (Checkout verify or the
`payment.failed` webhook).

**Impact**: customers cannot pay online; prepaid orders stay `PENDING_PAYMENT` and are
cancelled after 15 minutes. No money is lost: a payment captured after its order was
cancelled is refunded automatically.

**First checks**

```promql
sum by (purpose) (rate(payments_failed_total[10m]))
sum by (purpose, method) (rate(payments_captured_total[10m]))
```

```sql
-- what Razorpay says, last hour
SELECT method, "failureCode", "failureReason", count(*)
FROM payments."Payment"
WHERE state = 'FAILED' AND "createdAt" > now() - interval '1 hour'
GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- webhooks that did not verify or failed to process
SELECT "eventType", "signatureValid", left(error, 80), count(*)
FROM payments."PaymentWebhookEvent"
WHERE "receivedAt" > now() - interval '1 hour' AND (NOT "signatureValid" OR error IS NOT NULL)
GROUP BY 1, 2, 3;
```

Also check Razorpay's status page and dashboard for method or bank outages.

Webhooks are stored once per event id before they are processed, and a repeated
delivery of the same event id is answered `duplicate` without processing. A webhook that
failed (bad signature, or an error while processing) is therefore not fixed by Razorpay's
retries, and nothing polls Razorpay for missed captures: look such payments up in the
Razorpay dashboard. If Razorpay captured money for a payment still `CREATED` here, the
order has usually been cancelled after 15 minutes; refund it from the Razorpay dashboard.

**Likely causes**: a UPI app, bank or card network outage (one `method` dominates); a
Razorpay incident; fraud or risk rules on the Razorpay account.

**Mitigation**: nothing to restart on our side for a provider outage. Tell customers
through a CMS banner in admin-web that cash on delivery (orders up to ₹3,000) and the
FoodGrid wallet still work; disable an affected method in the Razorpay dashboard if it
keeps failing.

**Escalation**: payments owner and finance; open a Razorpay support ticket with the
failure codes.

## Orders dropped

**Fires when** (critical, for 30 minutes)

```promql
sum(rate(orders_created_total[30m])) < 0.5 * sum(rate(orders_created_total[30m] offset 1w))
and sum(rate(orders_created_total[30m] offset 1w)) > 0.05
```

App and web checkouts are below half of the same time last week, and last week had at
least 3 orders per minute then. `orders_created_total` counts checkouts only (not POS or
QR orders). It needs a week of history: after Prometheus data is lost the alert cannot
fire for a week.

**Impact**: lost revenue; usually a symptom of something else.

**First checks**

```promql
sum by (payment_method) (rate(orders_created_total[30m]))
service:http_errors:ratio5m
sum by (route, status) (rate(http_request_duration_seconds_count{service="order-service", route="/api/v1/orders"}[10m]))
sum by (route, status) (rate(http_request_duration_seconds_count{service="auth-service"}[10m]))
```

```sql
-- outlets open right now, and fraud blocks in the last hour
SELECT status, "isOpen", count(*) FROM commerce."Outlet" GROUP BY 1, 2;
SELECT decision, count(*) FROM ai."FraudAssessment" WHERE "createdAt" > now() - interval '1 hour' GROUP BY 1;
```

Try the customer flow yourself on the website and the app.

**Likely causes**

- Customers cannot sign in: OTP SMS not delivered (notification-service or the SMS
  provider), auth-service errors.
- Checkout failing: order-service errors, `ORDER_BLOCKED` from fraud scoring, outlets
  closed or suspended (an `identity.tenant.status_changed` storm), every address
  unserviceable.
- The storefront or the API host is unreachable: ALB, DNS, certificate, WAF blocking
  legitimate traffic (production).
- A real-world reason (rain, a holiday, a competitor offer): compare with the
  admin-web overview (GMV per day) and the order panels of the Grafana dashboard before
  acting.

**Mitigation**: fix or roll back the failing piece; for WAF false positives, check the
web ACL's sampled requests and switch the rule to count mode.

**Escalation**: on-call backend engineer and the business on-call (ops) at once.

## Rider supply

**Fires when** (warning, for 15 minutes)

```promql
sum(rate(delivery_offers_total{outcome="expired"}[15m]))
  / clamp_min(sum(rate(delivery_offers_total{outcome="sent"}[15m])), 1e-9) > 0.4
```

More than 40 % of the delivery offers sent to riders expire unanswered (an offer lasts
45 s).

**Impact**: deliveries wait longer for a rider; after 8 unanswered or rejected offers a
delivery becomes `UNASSIGNED` and needs ops.

**First checks**

```promql
sum by (outcome) (rate(delivery_offers_total[15m]))
```

```sql
-- riders available now
SELECT count(*) FILTER (WHERE "isOnline") AS online,
       count(*) FILTER (WHERE "isOnline" AND NOT "isOnDelivery") AS free,
       count(*) FILTER (WHERE "isOnline" AND "lastLocationAt" > now() - interval '5 minutes') AS dispatchable
FROM delivery."RiderProfile" WHERE status = 'ACTIVE';
-- deliveries waiting
SELECT status, count(*), min("createdAt") FROM delivery."Delivery"
WHERE status IN ('SEARCHING', 'UNASSIGNED') GROUP BY 1;
```

In admin-web: Riders → Live supply. The `ops` socket room receives
`delivery:unassigned`. Push delivery health:
`sum by (channel, status) (rate(notifications_sent_total[15m]))` (`SENT`, `FAILED`,
`SKIPPED`).

**Likely causes**

- Demand above supply (peak hour, rain): many offers go to the few free riders.
- Riders online but not receiving offers: offers reach the rider app over the socket
  (`offer:new`) and a push; FCM failures (`notifications_sent_total`, notification-service
  logs) or socket problems on delivery-service hide them.
- Stale locations: riders whose app stopped sending positions are skipped (no fix in 5
  minutes) and taken offline after 10.

**Mitigation**: offer waiting deliveries to a chosen rider with
`POST /api/v1/admin/deliveries/{id}/reassign` and body `{"riderId": "<rider profile id>"}`
(API only, permission `platform:riders`; see Tools); surge recomputes every minute on its
own; start an incentive scheme for the zone and hours (admin-web → Riders → Incentives);
ask merchants for longer prep times; contact riders who are online but not accepting.

**Escalation**: ops lead; backend on-call if offers are not reaching rider apps.

## Event consumer errors

**Fires when** `sum by (service, type) (rate(domain_events_processed_total{outcome="error"}[5m])) > 0`
for 10 minutes (warning): a service keeps failing to handle an event type. See
[events.md](./events.md) for what each handler does.

**Impact**: the reaction to that event is delayed or missing (an order not moving after
payment, a delivery not created, a refund or wallet credit not booked). Failed entries
are retried every ~30 s; after the 5th delivery they move to `events:dlq` and are not
retried again.

**First checks**

```sh
# the failing handler and its error ("Event <entry id> on events:<stream> failed: <message>")
kubectl -n foodgrid logs -l app.kubernetes.io/name=<service> --since=30m --tail=-1 | grep 'on events:' | tail -20
rcmd XPENDING events:<stream> <service>          # pending count for the group
rcmd XLEN events:dlq
rcmd XRANGE events:dlq - + COUNT 10              # stream, group, entryId, type, envelope
```

**Likely causes**: a handler bug on an unexpected payload; a dependency the handler
needs is down (database, another service); a data problem (a missing row, a constraint).

**Mitigation**: fix the cause (deploy the fix, restore the dependency). Entries still
pending are retried automatically; for the ones already dead-lettered, follow
[replaying a stuck consumer group](#replaying-a-stuck-consumer-group). Handlers that
already succeeded for an event are skipped on replay.

**Escalation**: the owner of the consuming service; payment-service and order-service
handlers affect money and orders, so page for those.

## Other alerts

| Alert                    | Fires when                                                            | What to do                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FoodGridEventLoopBlocked | `max by (service) (nodejs_eventloop_lag_p99_seconds) > 0.5` for 5 min | CPU-bound work in a request or handler; check the service's CPU and slow routes as in [slow responses](#slow-responses), restart the pod if one is stuck.                                                         |
| FoodGridAutoscalerAtMax  | an HPA in `foodgrid` at `maxReplicas` for 15 min                      | Check whether load is real (traffic) or a regression (CPU per request); raise `maxReplicas` in `scripts/generate-k8s.ts` if real. Check the cluster autoscaler can add nodes (`kubectl get nodes`, pending pods). |
| FoodGridPodRestarting    | more than 3 restarts of a pod in 15 min                               | Same checks as [service down](#service-down).                                                                                                                                                                     |

## Rolling back a deploy

Images are tagged with the commit SHA and every commit CD built on main stays in ECR, so
a rollback is a deployment of an older SHA. Migrations are not rolled back (Prisma
migrations only go forward); they must stay compatible with the previous release, as the
pull request checklist requires.

1. Find the SHA to return to: the previous successful run of the environment in GitHub
   (Deployments, or `gh run list --workflow cd.yml`), or what is running now:
   `kubectl -n foodgrid get deploy order-service -o jsonpath='{.spec.template.spec.containers[0].image}'`.
2. **Production**: `gh workflow run cd.yml --ref main -f sha=<full 40-character sha>`
   and approve the `production` environment. Nothing is rebuilt.
3. **Staging**: re-run the CD run of that commit (`gh run rerun <run id>`); its image
   jobs find the images in ECR and skip the build, then it deploys that SHA.
4. **Faster, while CD runs**: `kubectl -n foodgrid rollout undo deployment/<name>` returns
   one Deployment to its previous ReplicaSet. The next CD deploy overwrites it, so follow
   up with step 2 or 3.

If a migration itself is the problem, fix forward with a new migration.

## Re-running the migration job

CD runs the migrations as Job `db-migrate` (image `foodgrid/migrate`, `pnpm db:deploy`,
i.e. `prisma migrate deploy`) before applying the release, and stops if it fails.

- **From GitHub**: re-run the failed "Deploy to <env>" job. It deletes the old Job,
  applies it again, waits for it and prints its logs.
- **By hand**, with the manifests the deploy uploaded:

  ```sh
  gh run download <run id> -n manifests-<env>-<sha>     # app.yaml, migrate.yaml, prereqs.yaml, images.txt
  kubectl -n foodgrid delete job db-migrate --ignore-not-found --cascade=foreground --wait=true
  kubectl apply -f migrate.yaml
  kubectl -n foodgrid wait job/db-migrate --for=condition=Complete --timeout=16m
  kubectl -n foodgrid logs -l batch.kubernetes.io/job-name=db-migrate --tail=-1
  ```

- **A migration failed half-way**: `prisma migrate deploy` then refuses to continue
  (`P3009`) until the failed migration is resolved. Undo whatever it partly applied
  (psql), then mark it rolled back with a one-off copy of the Job: in `migrate.yaml`
  rename the Job to `db-migrate-resolve` and set
  `args: ["exec", "prisma", "migrate", "resolve", "--rolled-back", "<migration folder name>"]`,
  apply it, check its logs, delete it, and deploy the fixed migration.

## Rotating JWT keys and secrets

All values live in AWS Secrets Manager (`foodgrid/<env>/app`, `/auth`, `/payment`) and
reach the pods through External Secrets, as environment variables read at start-up. The
general pattern is: update the secret, force a sync, restart. The `update` helper and the
key table are in the
[Terraform README](../infrastructure/terraform/README.md#filling-the-secrets).

```sh
kubectl -n foodgrid annotate externalsecret --all force-sync=$(date +%s) --overwrite
kubectl -n foodgrid get externalsecret            # wait until all are Ready
kubectl -n foodgrid rollout restart deployment    # every service and web app
```

| Secret                                                                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT key pair (`JWT_PUBLIC_KEY_BASE64` in `app`, `JWT_PRIVATE_KEY_BASE64` in `auth`) | Generate a new pair with `bash scripts/generate-jwt-keys.sh <file>` and update both secrets before restarting. There is one active key, so access tokens signed with the old key are rejected (`401 TOKEN_INVALID`) once a service restarts; the apps refresh automatically (refresh tokens do not depend on the key). During the rolling restart old and new pods disagree for a few minutes: do it at a quiet hour. Restart the web apps too, they cache the JWKS for 10 minutes. |
| `INTERNAL_SERVICE_SECRET` (`app`)                                                   | Service-to-service calls fail with `401 Invalid service token` between pods on different values until the restart completes. Quiet hour.                                                                                                                                                                                                                                                                                                                                            |
| `OTP_SECRET` (`auth`)                                                               | Codes requested before the restart stop working (they expire within 5 minutes anyway).                                                                                                                                                                                                                                                                                                                                                                                              |
| `RAZORPAY_*` (`payment`)                                                            | Change the webhook secret in the Razorpay dashboard and restart payment-service together. Webhooks that arrive with the wrong secret are stored with `signatureValid = false`, answered 400 and not processed on retry (see [payment failures](#payment-failures)); the client's verify call still captures those payments.                                                                                                                                                         |
| `DATABASE_URL`, `REDIS_URL`                                                         | See "Rotating generated credentials" in the [Terraform README](../infrastructure/terraform/README.md#rotating-generated-credentials).                                                                                                                                                                                                                                                                                                                                               |

To sign everybody out after a suspected compromise, rotate the JWT keys (kills access
tokens) and revoke all refresh tokens:

```sql
UPDATE identity."RefreshToken" SET "revokedAt" = now(), "revokedReason" = 'mass-revoke'
WHERE "revokedAt" IS NULL;
```

One user's sessions: block the user in admin-web (Users) or call
`POST /api/v1/internal/auth/revoke-user-sessions` from inside the cluster.

## Draining the outbox

Each service relays its own outbox rows; there is nothing to run by hand when it is
healthy. A backlog means the owning service is down or cannot reach Redis.

```sql
SELECT source, count(*) AS unpublished, min("occurredAt") AS oldest
FROM platform."OutboxEvent"
WHERE "publishedAt" IS NULL
GROUP BY source ORDER BY oldest;
```

```sh
kubectl -n foodgrid logs -l app.kubernetes.io/name=<source service> --since=30m --tail=-1 | grep 'Outbox relay failed'
```

1. Make sure the source service runs with `OUTBOX_RELAY_ENABLED` unset or `true` (the
   default) and is healthy (`/health/ready` checks Redis).
2. Once Redis is reachable the relay drains on its own, 200 rows at a time with a 10 ms
   pause while there is a backlog. Watch `domain_events_published_total` and re-run the
   query.
3. Do not mark rows published by hand: their events would never be delivered.

Published rows are deleted after 7 days. If Redis lost stream data (for example a
restore from an old snapshot), republish everything since the loss; consumers skip
events they already handled:

```sql
UPDATE platform."OutboxEvent" SET "publishedAt" = NULL
WHERE "publishedAt" >= '<time of the data loss>';
```

## Replaying a stuck consumer group

Consumer groups are named after the consuming service (`order-service`, …) and created
on start-up. Pending entries are retried by the group itself; entries delivered five
times are in `events:dlq`.

```sh
rcmd XINFO GROUPS events:order                        # per group: consumers, pending, lag
rcmd XPENDING events:order payment-service - + 20     # entry id, consumer, idle ms, deliveries
rcmd XRANGE events:dlq - + COUNT 20
```

- **Pending but not moving**: every replica of the service is down, or the handler
  still fails (see [event consumer errors](#event-consumer-errors)). A replica that
  starts re-claims entries idle for 30 s.
- **Replay dead letters** after the fix is deployed: put the envelope back on its stream.
  Every group on that stream receives it again; handlers that already handled the event
  id skip it, so only the ones that failed run.

  ```sh
  replay() {  # replay <dlq entry id>
    kubectl -n foodgrid exec -i deploy/order-service -- node -e '
      const R = require("ioredis"); const r = new R(process.env.REDIS_URL);
      (async () => {
        const id = process.argv[1];
        const [entry] = await r.xrange("events:dlq", id, id);
        if (!entry) throw new Error(`no dead letter ${id}`);
        const f = {}; for (let i = 0; i < entry[1].length; i += 2) f[entry[1][i]] = entry[1][i + 1];
        await r.xadd(f.stream, "*", "type", f.type, "envelope", f.envelope);
        await r.xdel("events:dlq", id);
        console.log(`replayed ${f.type} to ${f.stream} (was ${f.group} ${f.entryId})`);
      })().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => r.quit());
    ' "$1"
  }
  replay 1791392374270-0
  ```

- **Re-read a whole range for one group** (for example after a handler silently did
  the wrong thing and was fixed): `rcmd XGROUP SETID events:<stream> <group> <entry id>`
  makes the group read again from after that id. Handlers skip event ids they already
  recorded in `platform.ProcessedEvent`; delete those rows for the fixed handler
  (`consumer = '<group>:<Class>.<method>'`) first if it must run again.

## Rider cash reconciliation

Riders collect cash for COD orders. On `delivery.delivered` payment-service credits the
rider wallet with the earning and the tip and debits the cash (`COD_COLLECTION`), so a
negative balance is cash the rider still has to hand in. A rider cannot cash out more
than a positive balance.

1. **See who owes cash**: admin-web → Finance → Rider cash, or
   `GET /api/v1/admin/rider-cash` (permission `platform:finance`): `cashDue`,
   `lastCollectedAt`, rider name and phone.
2. **Record a hand-in** (at a hub or a bank deposit):
   `POST /api/v1/admin/rider-cash/{userId}/deposits` with `{"amount": 1390.80, "reference": "HUB-0042"}`.
   The amount must not exceed what is due (`DEPOSIT_EXCEEDS_DUE`); it is booked as a
   `COD_COLLECTION` credit with reference type `CASH_DEPOSIT`.
3. **Check the wallet**: `GET /api/v1/admin/wallets/{walletId}/reconcile` replays the
   ledger and must return `"consistent": true`.
4. **When the numbers look wrong**, compare deliveries with ledger entries:

   ```sql
   -- COD deliveries the ledger has not debited yet (delivery.delivered still pending or dead-lettered)
   SELECT d.id, d."orderNumber", d."codAmount", d."deliveredAt"
   FROM delivery."Delivery" d
   LEFT JOIN payments."WalletTransaction" t ON t."idempotencyKey" = 'cod:' || d.id
   WHERE d."isCod" AND d.status = 'DELIVERED' AND t.id IS NULL;

   -- one rider's ledger
   SELECT t."createdAt", t.type, t.reason, t.amount, t."balanceAfter", t."referenceType", t."referenceId"
   FROM payments."WalletTransaction" t
   JOIN payments."Wallet" w ON w.id = t."walletId"
   WHERE w."ownerType" = 'RIDER' AND w."ownerId" = '<rider user id>'
   ORDER BY t."createdAt";
   ```

   Missing debits mean payment-service has not processed those `delivery.delivered`
   events: see [event consumer errors](#event-consumer-errors). Ledger entries carry
   idempotency keys (`earning:`, `tip:`, `cod:` + delivery id), so replaying is safe.
