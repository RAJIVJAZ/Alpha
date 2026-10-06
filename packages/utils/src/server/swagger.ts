import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

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
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
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
