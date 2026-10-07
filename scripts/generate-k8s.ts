/**
 * Generates the Kustomize base for FoodGrid from one table of workloads, so
 * 12 services, 6 web apps and the gateway stay consistent (probes, security
 * context, autoscaling, disruption budgets, network policy labels).
 *
 *   pnpm k8s:generate        # writes infrastructure/kubernetes/base
 *
 * Environment overlays (staging, production) are hand-written and small.
 * Re-run after `pnpm gateway:routes` so the gateway ConfigMap stays current.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';

const root = path.resolve(__dirname, '..');
const BASE = path.join(root, 'infrastructure', 'kubernetes', 'base');

type Kind = 'service' | 'web';
interface Workload {
  name: string;
  kind: Kind;
  port: number;
  cpu: string;
  memory: string;
  memoryLimit: string;
  minReplicas: number;
  maxReplicas: number;
  /** extra Secrets only this workload may read (least privilege) */
  secrets?: string[];
}

const svc = (name: string, port: number, o: Partial<Workload> = {}): Workload => ({
  name: `${name}-service`,
  kind: 'service',
  port,
  cpu: '100m',
  memory: '256Mi',
  memoryLimit: '512Mi',
  minReplicas: 2,
  maxReplicas: 6,
  ...o,
});
const web = (name: string, o: Partial<Workload> = {}): Workload => ({
  name,
  kind: 'web',
  port: 3000,
  cpu: '100m',
  memory: '192Mi',
  memoryLimit: '384Mi',
  minReplicas: 2,
  maxReplicas: 4,
  ...o,
});

export const WORKLOADS: Workload[] = [
  svc('auth', 4001, { secrets: ['foodgrid-auth-secrets'] }),
  svc('user', 4002),
  svc('order', 4003, {
    cpu: '250m',
    memory: '384Mi',
    memoryLimit: '768Mi',
    minReplicas: 3,
    maxReplicas: 12,
  }),
  svc('payment', 4004, { secrets: ['foodgrid-payment-secrets'] }),
  svc('inventory', 4005),
  svc('procurement', 4006),
  // Socket.IO with the Redis adapter; mobile clients use the websocket transport (no sticky sessions needed)
  svc('delivery', 4007, {
    cpu: '250m',
    memory: '384Mi',
    memoryLimit: '768Mi',
    minReplicas: 3,
    maxReplicas: 10,
  }),
  svc('supplier', 4008),
  svc('analytics', 4009, { memory: '384Mi', memoryLimit: '1Gi' }),
  svc('ads', 4010),
  svc('notification', 4011),
  svc('ai', 4012, { cpu: '250m', memory: '384Mi', memoryLimit: '1Gi' }),
  web('customer-web', {
    cpu: '200m',
    memory: '256Mi',
    memoryLimit: '512Mi',
    minReplicas: 3,
    maxReplicas: 12,
  }),
  web('admin-web'),
  web('restaurant-web', { maxReplicas: 6 }),
  web('supplier-web'),
  web('rider-web', { maxReplicas: 6 }),
  web('vendor-web'),
];

const PART_OF = 'foodgrid';
const labels = (name: string, component: string) => ({
  'app.kubernetes.io/name': name,
  'app.kubernetes.io/part-of': PART_OF,
  'app.kubernetes.io/component': component,
});
const selector = (name: string) => ({ 'app.kubernetes.io/name': name });

const podSecurity = {
  runAsNonRoot: true,
  runAsUser: 1000,
  runAsGroup: 1000,
  fsGroup: 1000,
  seccompProfile: { type: 'RuntimeDefault' },
};
const containerSecurity = {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  capabilities: { drop: ['ALL'] },
};

function spread(name: string) {
  return [
    {
      maxSkew: 1,
      topologyKey: 'topology.kubernetes.io/zone',
      whenUnsatisfiable: 'ScheduleAnyway',
      labelSelector: { matchLabels: selector(name) },
    },
    {
      maxSkew: 1,
      topologyKey: 'kubernetes.io/hostname',
      whenUnsatisfiable: 'ScheduleAnyway',
      labelSelector: { matchLabels: selector(name) },
    },
  ];
}

function deployment(w: Workload) {
  const isService = w.kind === 'service';
  const health = isService
    ? { live: '/health/live', ready: '/health/ready' }
    : { live: '/login', ready: '/login' };
  const writable = isService
    ? [{ name: 'tmp', mountPath: '/tmp' }]
    : [
        { name: 'tmp', mountPath: '/tmp' },
        // Next.js image optimisation and fetch cache
        { name: 'next-cache', mountPath: `/app/apps/${w.name}/.next/cache` },
      ];
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: w.name, labels: labels(w.name, w.kind) },
    spec: {
      replicas: w.minReplicas,
      revisionHistoryLimit: 5,
      selector: { matchLabels: selector(w.name) },
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: 0 } },
      template: {
        metadata: {
          labels: labels(w.name, w.kind),
          annotations: isService
            ? {
                'prometheus.io/scrape': 'true',
                'prometheus.io/port': String(w.port),
                'prometheus.io/path': '/metrics',
              }
            : {},
        },
        spec: {
          serviceAccountName: 'foodgrid-app',
          automountServiceAccountToken: isService,
          securityContext: podSecurity,
          terminationGracePeriodSeconds: 30,
          topologySpreadConstraints: spread(w.name),
          containers: [
            {
              name: 'app',
              image: `foodgrid/${w.name}`,
              imagePullPolicy: 'IfNotPresent',
              ports: [{ name: 'http', containerPort: w.port }],
              env: [{ name: 'PORT', value: String(w.port) }],
              envFrom: [
                { configMapRef: { name: 'foodgrid-config' } },
                ...(isService ? [{ secretRef: { name: 'foodgrid-secrets' } }] : []),
                ...(w.secrets ?? []).map((name) => ({ secretRef: { name } })),
              ],
              resources: {
                requests: { cpu: w.cpu, memory: w.memory },
                limits: { memory: w.memoryLimit },
              },
              startupProbe: {
                httpGet: { path: health.live, port: 'http' },
                periodSeconds: 5,
                failureThreshold: 30,
              },
              livenessProbe: {
                httpGet: { path: health.live, port: 'http' },
                periodSeconds: 15,
                timeoutSeconds: 3,
                failureThreshold: 3,
              },
              readinessProbe: {
                httpGet: { path: health.ready, port: 'http' },
                periodSeconds: 10,
                timeoutSeconds: 3,
                failureThreshold: 3,
              },
              // let the load balancer deregister the pod before it stops accepting connections
              lifecycle: { preStop: { exec: { command: ['sleep', '5'] } } },
              securityContext: containerSecurity,
              volumeMounts: writable,
            },
          ],
          volumes: writable.map((v) => ({
            name: v.name,
            emptyDir: { sizeLimit: v.name === 'tmp' ? '256Mi' : '512Mi' },
          })),
        },
      },
    },
  };
}

function service(w: { name: string; port: number; kind: string }, healthPath: string) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: w.name,
      labels: labels(w.name, w.kind),
      annotations: { 'alb.ingress.kubernetes.io/healthcheck-path': healthPath },
    },
    spec: {
      type: 'ClusterIP',
      selector: selector(w.name),
      ports: [{ name: 'http', port: w.port, targetPort: 'http' }],
    },
  };
}

function hpa(name: string, min: number, max: number) {
  return {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name,
      labels: { 'app.kubernetes.io/name': name, 'app.kubernetes.io/part-of': PART_OF },
    },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name },
      minReplicas: min,
      maxReplicas: max,
      metrics: [
        {
          type: 'Resource',
          resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } },
        },
      ],
      behavior: {
        scaleDown: {
          stabilizationWindowSeconds: 300,
          policies: [{ type: 'Percent', value: 50, periodSeconds: 60 }],
        },
      },
    },
  };
}

function pdb(name: string) {
  return {
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: {
      name,
      labels: { 'app.kubernetes.io/name': name, 'app.kubernetes.io/part-of': PART_OF },
    },
    spec: { maxUnavailable: 1, selector: { matchLabels: selector(name) } },
  };
}

const doc = (...objs: object[]) => objs.map((o) => stringify(o, { lineWidth: 0 })).join('---\n');
const write = (rel: string, content: string) => {
  const file = path.join(BASE, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `# Generated by scripts/generate-k8s.ts — do not edit by hand.\n${content}`);
};

function serviceUrls() {
  return Object.fromEntries(
    WORKLOADS.filter((w) => w.kind === 'service').map((w) => [
      `${w.name.replace(/-service$/, '').toUpperCase()}_SERVICE_URL`,
      `http://${w.name}:${w.port}`,
    ]),
  );
}

function main() {
  rmSync(BASE, { recursive: true, force: true });
  const resources: string[] = [];

  write(
    'namespace.yaml',
    doc({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: 'foodgrid', labels: { 'app.kubernetes.io/part-of': PART_OF } },
    }),
  );
  write(
    'serviceaccount.yaml',
    doc({
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      // overlays set eks.amazonaws.com/role-arn (IRSA: S3 media, SES, SNS)
      metadata: { name: 'foodgrid-app', labels: { 'app.kubernetes.io/part-of': PART_OF } },
    }),
  );
  write(
    'config.yaml',
    doc({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'foodgrid-config', labels: { 'app.kubernetes.io/part-of': PART_OF } },
      data: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        JWT_ISSUER: 'https://auth.foodgrid.in',
        JWT_AUDIENCE: 'foodgrid-api',
        JWT_ACCESS_TTL_SECONDS: '900',
        JWT_REFRESH_TTL_DAYS: '30',
        OTP_EXPOSE_IN_RESPONSE: 'false',
        AWS_REGION: 'ap-south-1',
        S3_MEDIA_BUCKET: 'foodgrid-media',
        CDN_BASE_URL: 'https://cdn.foodgrid.in',
        SMS_PROVIDER: 'msg91',
        PUSH_PROVIDER: 'fcm',
        EMAIL_PROVIDER: 'ses',
        SES_FROM_ADDRESS: 'no-reply@foodgrid.in',
        PLATFORM_GSTIN: '29AAACF0000A1ZP',
        PLATFORM_STATE_CODE: '29',
        CORS_ORIGINS: 'https://foodgrid.in,https://www.foodgrid.in',
        CUSTOMER_WEB_URL: 'https://foodgrid.in',
        // web apps call the API through the in-cluster gateway
        API_URL: 'http://gateway:8080/api/v1',
        ...serviceUrls(),
      },
    }),
  );
  // secrets live in AWS Secrets Manager; External Secrets Operator syncs them
  const externalSecret = (name: string, key: string) => ({
    apiVersion: 'external-secrets.io/v1',
    kind: 'ExternalSecret',
    metadata: { name, labels: { 'app.kubernetes.io/part-of': PART_OF } },
    spec: {
      refreshInterval: '1h',
      secretStoreRef: { kind: 'ClusterSecretStore', name: 'aws-secrets-manager' },
      target: { name, creationPolicy: 'Owner' },
      // overlays point key at foodgrid/<env>/...
      dataFrom: [{ extract: { key } }],
    },
  });
  write(
    'external-secrets.yaml',
    doc(
      // DATABASE_URL, REDIS_URL, JWT_PUBLIC_KEY_BASE64, INTERNAL_SERVICE_SECRET, FCM/MSG91/weather keys
      externalSecret('foodgrid-secrets', 'foodgrid/app'),
      // JWT_PRIVATE_KEY_BASE64, OTP_SECRET, GOOGLE_CLIENT_IDS — auth-service only
      externalSecret('foodgrid-auth-secrets', 'foodgrid/auth'),
      // RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET — payment-service only
      externalSecret('foodgrid-payment-secrets', 'foodgrid/payment'),
    ),
  );
  resources.push('namespace.yaml', 'serviceaccount.yaml', 'config.yaml', 'external-secrets.yaml');

  for (const w of WORKLOADS) {
    const file = `workloads/${w.name}.yaml`;
    write(
      file,
      doc(
        deployment(w),
        service(w, w.kind === 'service' ? '/health/ready' : '/login'),
        hpa(w.name, w.minReplicas, w.maxReplicas),
        pdb(w.name),
      ),
    );
    resources.push(file);
  }

  // nginx API gateway (same generated routing as docker-compose)
  mkdirSync(path.join(BASE, 'gateway'), { recursive: true });
  copyFileSync(
    path.join(root, 'infrastructure', 'docker', 'nginx', 'gateway.conf'),
    path.join(BASE, 'gateway', 'gateway.conf'),
  );
  const gateway = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'gateway', labels: labels('gateway', 'gateway') },
    spec: {
      replicas: 2,
      selector: { matchLabels: selector('gateway') },
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: 0 } },
      template: {
        metadata: { labels: labels('gateway', 'gateway') },
        spec: {
          automountServiceAccountToken: false,
          securityContext: { ...podSecurity, runAsUser: 101, runAsGroup: 101, fsGroup: 101 },
          topologySpreadConstraints: spread('gateway'),
          containers: [
            {
              name: 'nginx',
              image: 'nginxinc/nginx-unprivileged:1.27-alpine',
              ports: [{ name: 'http', containerPort: 8080 }],
              resources: { requests: { cpu: '100m', memory: '64Mi' }, limits: { memory: '256Mi' } },
              livenessProbe: { httpGet: { path: '/healthz', port: 'http' }, periodSeconds: 10 },
              readinessProbe: { httpGet: { path: '/healthz', port: 'http' }, periodSeconds: 5 },
              lifecycle: { preStop: { exec: { command: ['sleep', '5'] } } },
              securityContext: containerSecurity,
              volumeMounts: [
                {
                  name: 'config',
                  mountPath: '/etc/nginx/conf.d/default.conf',
                  subPath: 'gateway.conf',
                },
                { name: 'tmp', mountPath: '/tmp' },
                { name: 'cache', mountPath: '/var/cache/nginx' },
              ],
            },
          ],
          volumes: [
            { name: 'config', configMap: { name: 'gateway-config' } },
            { name: 'tmp', emptyDir: {} },
            { name: 'cache', emptyDir: {} },
          ],
        },
      },
    },
  };
  write(
    'gateway/gateway.yaml',
    doc(
      gateway,
      service({ name: 'gateway', port: 8080, kind: 'gateway' }, '/healthz'),
      hpa('gateway', 2, 6),
      pdb('gateway'),
    ),
  );
  resources.push('gateway/gateway.yaml');

  // public entry points (AWS Load Balancer Controller); overlays set hosts, certificate and CIDRs
  const alb = (extra: Record<string, string> = {}) => ({
    'alb.ingress.kubernetes.io/group.name': 'foodgrid',
    'alb.ingress.kubernetes.io/scheme': 'internet-facing',
    'alb.ingress.kubernetes.io/target-type': 'ip',
    'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}, {"HTTPS": 443}]',
    'alb.ingress.kubernetes.io/ssl-redirect': '443',
    'alb.ingress.kubernetes.io/ssl-policy': 'ELBSecurityPolicy-TLS13-1-2-2021-06',
    // tracking sockets stay open
    'alb.ingress.kubernetes.io/load-balancer-attributes':
      'idle_timeout.timeout_seconds=3600,routing.http.drop_invalid_header_fields.enabled=true',
    ...extra,
  });
  const rule = (host: string, backend: string, port: number) => ({
    host,
    http: {
      paths: [
        {
          path: '/',
          pathType: 'Prefix',
          backend: { service: { name: backend, port: { number: port } } },
        },
      ],
    },
  });
  write(
    'ingress.yaml',
    doc(
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: 'foodgrid-public',
          labels: { 'app.kubernetes.io/part-of': PART_OF },
          annotations: alb(),
        },
        spec: {
          ingressClassName: 'alb',
          rules: [
            rule('api.foodgrid.in', 'gateway', 8080),
            rule('foodgrid.in', 'customer-web', 3000),
            rule('www.foodgrid.in', 'customer-web', 3000),
            rule('partner.foodgrid.in', 'restaurant-web', 3000),
            rule('business.foodgrid.in', 'vendor-web', 3000),
            rule('supplier.foodgrid.in', 'supplier-web', 3000),
            rule('rider.foodgrid.in', 'rider-web', 3000),
          ],
        },
      },
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        // same load balancer, but only reachable from the office / VPN ranges
        metadata: {
          name: 'foodgrid-admin',
          labels: { 'app.kubernetes.io/part-of': PART_OF },
          annotations: alb({ 'alb.ingress.kubernetes.io/inbound-cidrs': '10.0.0.0/8' }),
        },
        spec: { ingressClassName: 'alb', rules: [rule('admin.foodgrid.in', 'admin-web', 3000)] },
      },
    ),
  );
  resources.push('ingress.yaml');

  const component = (c: string) => ({ matchLabels: { 'app.kubernetes.io/component': c } });
  write(
    'network-policies.yaml',
    doc(
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: { name: 'default-deny-ingress' },
        spec: { podSelector: {}, policyTypes: ['Ingress'] },
      },
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        // the ALB (target-type ip) reaches the gateway and web apps directly
        metadata: { name: 'allow-edge' },
        spec: {
          podSelector: {
            matchExpressions: [
              { key: 'app.kubernetes.io/component', operator: 'In', values: ['gateway', 'web'] },
            ],
          },
          policyTypes: ['Ingress'],
          ingress: [{ ports: [{ port: 'http' }] }],
        },
      },
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        // services take traffic from the gateway and from each other (internal APIs), never from web pods
        metadata: { name: 'allow-to-services' },
        spec: {
          podSelector: component('service'),
          policyTypes: ['Ingress'],
          ingress: [
            {
              from: [{ podSelector: component('gateway') }, { podSelector: component('service') }],
              ports: [{ port: 'http' }],
            },
          ],
        },
      },
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: { name: 'allow-metrics-scrape' },
        spec: {
          podSelector: component('service'),
          policyTypes: ['Ingress'],
          ingress: [
            {
              from: [
                {
                  namespaceSelector: {
                    matchLabels: { 'kubernetes.io/metadata.name': 'monitoring' },
                  },
                },
              ],
              ports: [{ port: 'http' }],
            },
          ],
        },
      },
    ),
  );
  resources.push('network-policies.yaml');

  write(
    'kustomization.yaml',
    stringify({
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      namespace: 'foodgrid',
      resources,
      configMapGenerator: [{ name: 'gateway-config', files: ['gateway/gateway.conf'] }],
      labels: [{ pairs: { 'app.kubernetes.io/part-of': PART_OF }, includeSelectors: false }],
    }),
  );

  // database migrations run as a Job before each rollout (see .github/workflows/cd.yml)
  write(
    'migrate/job.yaml',
    doc({
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'db-migrate', labels: labels('db-migrate', 'job') },
      spec: {
        backoffLimit: 2,
        activeDeadlineSeconds: 900,
        ttlSecondsAfterFinished: 86400,
        template: {
          metadata: { labels: labels('db-migrate', 'job') },
          spec: {
            restartPolicy: 'Never',
            automountServiceAccountToken: false,
            securityContext: podSecurity,
            containers: [
              {
                name: 'migrate',
                image: 'foodgrid/migrate',
                args: ['db:deploy'],
                envFrom: [{ secretRef: { name: 'foodgrid-secrets' } }],
                resources: {
                  requests: { cpu: '100m', memory: '256Mi' },
                  limits: { memory: '512Mi' },
                },
                // pnpm and Prisma write caches under HOME
                env: [{ name: 'HOME', value: '/tmp' }],
                securityContext: containerSecurity,
                volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }],
              },
            ],
            volumes: [{ name: 'tmp', emptyDir: {} }],
          },
        },
      },
    }),
  );
  write(
    'migrate/kustomization.yaml',
    stringify({
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      namespace: 'foodgrid',
      resources: ['job.yaml'],
    }),
  );

  console.log(`Kubernetes base: ${WORKLOADS.length + 1} workloads → ${path.relative(root, BASE)}`);
}

main();
