/**
 * Local API gateway for development without Docker: routes /api/v1/* and the
 * tracking websocket (/ws) to services on localhost using the generated table
 * in infrastructure/gateway/routes.json — the same routing nginx uses.
 *
 *   pnpm dev:gateway            # listens on :8080 (GATEWAY_PORT to change)
 */
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface Table { blocked: string[]; services: Record<string, { port: number }>; routes: { prefix: string; service: string; websocket?: boolean }[] }

const table = JSON.parse(readFileSync(path.resolve(__dirname, '../infrastructure/gateway/routes.json'), 'utf8')) as Table;
const PORT = Number(process.env.GATEWAY_PORT ?? 8080);

function target(url: string) {
  const pathname = url.split('?')[0]!;
  if (table.blocked.some((b) => pathname.startsWith(b))) return null;
  const route = table.routes.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`) || (r.prefix.endsWith('.json') && pathname === r.prefix));
  if (!route) return null;
  const envUrl = process.env[`${route.service.replace(/-service$/, '').toUpperCase()}_SERVICE_URL`];
  const base = new URL(envUrl ?? `http://127.0.0.1:${table.services[route.service]!.port}`);
  return { host: base.hostname, port: Number(base.port), service: route.service };
}

const notFound = (res: http.ServerResponse, status = 404, message = 'Not found') => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ statusCode: status, message, code: status === 404 ? 'NOT_FOUND' : 'BAD_GATEWAY' }));
};

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') return void res.end('ok\n');
  const t = target(req.url ?? '/');
  if (!t) return notFound(res);
  const started = Date.now();
  const upstream = http.request(
    {
      host: t.host,
      port: t.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '', 'x-forwarded-proto': 'http' },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
      up.on('end', () => console.log(`${req.method} ${req.url} -> ${t.service} ${up.statusCode} ${Date.now() - started}ms`));
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
    const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () => console.log(`dev gateway on http://localhost:${PORT} (${table.routes.length} routes)`));
