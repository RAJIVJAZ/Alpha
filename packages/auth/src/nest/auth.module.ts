import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenService, TokenConfig, tokenConfigFromEnv } from '../tokens';
import { AuthGuard } from './auth.guard';
import { AUTH_MODULE_OPTIONS, SESSION_REVOCATION_CHECKER } from './constants';

export interface SessionRevocationChecker {
  isRevoked(sessionId: string): Promise<boolean>;
}

export interface AuthModuleOptions {
  token?: TokenConfig;
  internalSecret: string;
  /** Register AuthGuard as a global APP_GUARD (default true). */
  globalGuard?: boolean;
  revocationChecker?: Provider;
}

@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: AUTH_MODULE_OPTIONS, useValue: options },
      {
        provide: AccessTokenService,
        useFactory: () => new AccessTokenService(options.token ?? tokenConfigFromEnv()),
      },
      AuthGuard,
    ];
    if (options.globalGuard !== false)
      providers.push({ provide: APP_GUARD, useExisting: AuthGuard });
    if (options.revocationChecker) providers.push(options.revocationChecker);
    return {
      module: AuthModule,
      providers,
      exports: [
        AccessTokenService,
        AuthGuard,
        AUTH_MODULE_OPTIONS,
        ...(options.revocationChecker ? [SESSION_REVOCATION_CHECKER] : []),
      ],
    };
  }
}
