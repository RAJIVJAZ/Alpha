import type { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { configureApp, ServiceBootstrapOptions } from '../bootstrap';

/**
 * Boots a service's AppModule with the same HTTP conventions as production
 * (global prefix, validation, error envelope). `configure` can override
 * providers, e.g. InternalHttpService with a FakeInternalHttp.
 */
export async function createTestApp(
  module: unknown,
  options: ServiceBootstrapOptions,
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [module as never] })).compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  configureApp(app, options);
  await app.init();
  return app;
}
