import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { IS_INTERNAL_KEY, IS_PUBLIC_KEY } from '@foodgrid/auth/nest';

export interface SwaggerOptions {
  name: string;
  title: string;
  description: string;
  version?: string;
}

export function buildOpenApiDocument(app: INestApplication, opts: SwaggerOptions): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(opts.title)
    .setDescription(opts.description)
    .setVersion(opts.version ?? '1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-service-token' }, 'service-token')
    .addServer('/', 'Gateway / local')
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => operationId(controllerKey, methodKey),
  });
  applyRouteSecurity(app, document);
  return document;
}

const operationId = (controller: string, method: string) => `${controller.replace(/Controller$/, '')}_${method}`;

/**
 * Derives each operation's security requirement from the same metadata the
 * global AuthGuard enforces (@Public, @Internal), instead of relying on
 * @ApiBearerAuth being remembered on every controller.
 */
function applyRouteSecurity(app: INestApplication, document: OpenAPIObject) {
  const access = new Map<string, 'public' | 'internal' | 'bearer'>();
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
      if (!cls?.prototype) continue;
      const proto = cls.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const flag = (key: string) => Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, cls);
        access.set(operationId(cls.name, name), flag(IS_INTERNAL_KEY) ? 'internal' : flag(IS_PUBLIC_KEY) ? 'public' : 'bearer');
      }
    }
  }
  for (const item of Object.values(document.paths)) {
    for (const op of Object.values(item)) {
      if (!op || typeof op !== 'object' || !('responses' in op)) continue;
      const kind = access.get((op as { operationId?: string }).operationId ?? '') ?? 'bearer';
      (op as { security?: Record<string, string[]>[] }).security = kind === 'public' ? [] : kind === 'internal' ? [{ 'service-token': [] }] : [{ bearer: [] }];
    }
  }
}

export function setupSwagger(app: INestApplication, opts: SwaggerOptions): OpenAPIObject {
  const document = buildOpenApiDocument(app, opts);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    customSiteTitle: `${opts.title} — API`,
    swaggerOptions: { persistAuthorization: true },
  });
  return document;
}
