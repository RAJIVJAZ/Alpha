/**
 * Node API gateway: routes /api/v1/* and the tracking websocket (/ws) to the
 * services using the generated table in infrastructure/gateway/routes.json —
 * the same routing nginx uses. Runs locally without Docker and on Railway.
 *
 * Like nginx it appends the caller to X-Forwarded-For (the services read the
 * client IP from it) and rate limits OTP requests and password logins per IP.
 *
 *   pnpm dev:gateway            # listens on :8080 (GATEWAY_PORT to change)
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface Table {
  blocked: string[];
  services: Record<string, { port: number }>;
  routes: { prefix: string; service: string; websocket?: boolean }[];
}

const table = JSON.parse(
  readFileSync(path.resolve(__dirname, '../infrastructure/gateway/routes.json'), 'utf8'),
) as Table;
const PORT = Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 8080);

function target(url: string) {
  const pathname = url.split('?')[0]!;
  if (table.blocked.some((b) => pathname.startsWith(b))) return null;
  const route = table.routes.find(
    (r) =>
      pathname === r.prefix ||
      pathname.startsWith(`${r.prefix}/`) ||
      (r.prefix.endsWith('.json') && pathname === r.prefix),
  );
  if (!route) return null;
  const envUrl = process.env[`${route.service.replace(/-service$/, '').toUpperCase()}_SERVICE_URL`];
  const base = new URL(envUrl ?? `http://127.0.0.1:${table.services[route.service]!.port}`);
  return { host: base.hostname, port: Number(base.port), service: route.service };
}

// nginx: limit_req zone=auth rate=10r/m burst=5 nodelay
const AUTH_LIMITED = /^\/api\/v1\/auth\/(otp\/request|password)$/;
const AUTH_BURST = 6;
const AUTH_REFILL_MS = 6_000;
const buckets = new Map<string, { tokens: number; at: number }>();

/** Client IP: the first X-Forwarded-For hop (set by the edge proxy or the web apps), else the peer. */
function clientIp(req: http.IncomingMessage) {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function allowAuth(ip: string, now = Date.now()) {
  const b = buckets.get(ip) ?? { tokens: AUTH_BURST, at: now };
  b.tokens = Math.min(AUTH_BURST, b.tokens + (now - b.at) / AUTH_REFILL_MS);
  b.at = now;
  buckets.set(ip, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// forget idle clients (a full bucket is the same as no bucket)
setInterval(() => {
  const cutoff = Date.now() - AUTH_BURST * AUTH_REFILL_MS;
  for (const [ip, b] of buckets) if (b.at < cutoff) buckets.delete(ip);
}, 60_000).unref();

function forwardedHeaders(req: http.IncomingMessage) {
  const prior = req.headers['x-forwarded-for'];
  const peer = req.socket.remoteAddress ?? '';
  return {
    ...req.headers,
    'x-forwarded-for': prior ? `${Array.isArray(prior) ? prior.join(', ') : prior}, ${peer}` : peer,
    'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'http',
    'x-request-id': req.headers['x-request-id'] ?? randomUUID(),
  };
}

const notFound = (res: http.ServerResponse, status = 404, message = 'Not found') => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      statusCode: status,
      message,
      code: status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'BAD_GATEWAY',
    }),
  );
};

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') return void res.end('ok\n');
  const t = target(req.url ?? '/');
  if (!t) return notFound(res);
  if (AUTH_LIMITED.test((req.url ?? '/').split('?')[0]!) && !allowAuth(clientIp(req)))
    return notFound(res, 429, 'Too many attempts, try again in a minute');
  const started = Date.now();
  const headers = forwardedHeaders(req);
  const upstream = http.request(
    {
      host: t.host,
      port: t.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, {
        ...up.headers,
        'x-request-id': headers['x-request-id'],
      });
      up.pipe(res);
      up.on('end', () =>
        console.log(
          `${req.method} ${req.url} -> ${t.service} ${up.statusCode} ${Date.now() - started}ms`,
        ),
      );
    },
  );
  upstream.on('error', (err) => {
    console.error(`${req.method} ${req.url} -> ${t.service} failed: ${err.message}`);
    if (!res.headersSent) notFound(res, 502, `${t.service} is unavailable`);
  });
  req.pipe(upstream);
});

// websocket / socket.io upgrade: raw TCP passthrough
server.on('upgrade', (req, socket, head) => {
  const t = target(req.url ?? '/');
  if (!t) return socket.destroy();
  const upstream = net.connect(t.port, t.host, () => {
    const headers = Object.entries(forwardedHeaders(req))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () =>
  console.log(`dev gateway on http://localhost:${PORT} (${table.routes.length} routes)`),
);
