import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createServiceApp } from '@foodgrid/utils/server';
import { AppModule } from './app.module';
import { SERVICE } from './service.config';
import { RedisIoAdapter } from './tracking/redis-io.adapter';

async function main() {
  const app = await createServiceApp(AppModule, SERVICE);
  const adapter = new RedisIoAdapter(app, process.env.REDIS_URL ?? 'redis://localhost:6379');
  adapter.connect();
  app.useWebSocketAdapter(adapter);
  const port = Number(process.env.PORT ?? SERVICE.defaultPort);
  // like createServiceApp's other services: no fixed host, so Node binds IPv6 and IPv4 where the
  // machine has IPv6 (Railway's private network); HOST still overrides it
  await (process.env.HOST ? app.listen(port, process.env.HOST) : app.listen(port));
  new Logger('Bootstrap').log(
    `${SERVICE.name} listening on :${port} (websocket /ws, namespace /tracking)`,
  );
}

void main();
