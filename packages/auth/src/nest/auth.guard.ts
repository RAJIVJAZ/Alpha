import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole, TenantType } from '@foodgrid/types';
import {
  Permission,
  permissionDeniedMessage,
  permissionsFor,
  roleRequiredMessage,
} from '../permissions';
import { AccessTokenService, extractBearer, TokenError, verifyServiceToken } from '../tokens';
import {
  ALLOW_REJECTED_TENANT_KEY,
  ALLOW_SERVICE_KEY,
  AUTH_MODULE_OPTIONS,
  IS_INTERNAL_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  SERVICE_TOKEN_HEADER,
  SESSION_REVOCATION_CHECKER,
  TENANT_TYPES_KEY,
} from './constants';
import type { AuthenticatedRequest } from './decorators';
import type { AuthModuleOptions, SessionRevocationChecker } from './auth.module';

/**
 * Single global guard implementing the platform's authorization pipeline:
 *   @Public -> @Internal (service token) -> access token -> session
 *   revocation -> platform roles -> tenant context -> permissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    @Inject(AUTH_MODULE_OPTIONS) private readonly options: AuthModuleOptions,
    @Optional()
    @Inject(SESSION_REVOCATION_CHECKER)
    private readonly revocation?: SessionRevocationChecker,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  private getRequest(ctx: ExecutionContext): AuthenticatedRequest {
    if (ctx.getType() === 'ws') {
      const client = ctx.switchToWs().getClient();
      client.data ??= {};
      client.data.headers ??= client.handshake?.headers ?? {};
      return client.data;
    }
    return ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // health / metrics endpoints registered outside Nest routing never reach here
    const req = this.getRequest(ctx);
    const isPublic = this.meta<boolean>(IS_PUBLIC_KEY, ctx);
    const isInternal = this.meta<boolean>(IS_INTERNAL_KEY, ctx);
    const allowService = this.meta<boolean>(ALLOW_SERVICE_KEY, ctx);

    const serviceToken = req.headers[SERVICE_TOKEN_HEADER];
    if (serviceToken && (isInternal || allowService)) {
      try {
        req.service = verifyServiceToken(
          this.options.internalSecret,
          Array.isArray(serviceToken) ? serviceToken[0]! : serviceToken,
        );
        return true;
      } catch {
        throw new UnauthorizedException('Invalid service token');
      }
    }
    if (isInternal) throw new UnauthorizedException('Service token required');

    const bearer = extractBearer(req.headers.authorization);
    if (!bearer) {
      if (isPublic) return true;
      throw new UnauthorizedException('Missing access token');
    }

    try {
      req.user = this.tokens.verify(bearer);
    } catch (err) {
      if (isPublic) return true;
      const reason = err instanceof TokenError ? err.reason : 'invalid';
      throw new UnauthorizedException({
        message: 'Invalid access token',
        code: `TOKEN_${reason.toUpperCase()}`,
      });
    }

    if (this.revocation && req.user.sid && (await this.revocation.isRevoked(req.user.sid))) {
      throw new UnauthorizedException({ message: 'Session revoked', code: 'SESSION_REVOKED' });
    }
    if (isPublic) return true;

    const user = req.user;
    const isAdmin = user.roles?.includes('ADMIN');

    const roles = this.meta<PlatformRole[]>(ROLES_KEY, ctx);
    if (roles?.length && !isAdmin && !roles.some((r) => user.roles?.includes(r))) {
      throw new ForbiddenException({
        message: roleRequiredMessage(roles),
        code: 'FORBIDDEN',
        details: roles,
      });
    }

    const tenantTypes = this.meta<TenantType[]>(TENANT_TYPES_KEY, ctx);
    if (tenantTypes) {
      if (!user.tenantId)
        throw new ForbiddenException({
          message: 'Select a business first',
          code: 'TENANT_REQUIRED',
        });
      // a rejected business stays in the session only to fix and resubmit its application
      if (user.tenantStatus === 'REJECTED' && !this.meta<boolean>(ALLOW_REJECTED_TENANT_KEY, ctx))
        throw new ForbiddenException({
          message: 'This business was not approved. Update and resubmit its application.',
          code: 'TENANT_REJECTED',
        });
      if (tenantTypes.length && (!user.tenantType || !tenantTypes.includes(user.tenantType))) {
        throw new ForbiddenException({
          message: 'Not available for this business type',
          code: 'TENANT_TYPE_MISMATCH',
        });
      }
    }

    const permissions = this.meta<Permission[]>(PERMISSIONS_KEY, ctx);
    if (permissions?.length) {
      const granted = permissionsFor(user);
      const missing = permissions.filter((p) => !granted.has(p));
      if (missing.length) {
        // clients key off code + details; the message is shown to people as-is
        throw new ForbiddenException({
          message: permissionDeniedMessage(missing),
          code: 'PERMISSION_DENIED',
          details: missing,
        });
      }
    }
    return true;
  }
}
