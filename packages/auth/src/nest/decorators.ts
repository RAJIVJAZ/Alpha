import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { AccessTokenClaims, PlatformRole, ServiceTokenClaims, TenantType } from '@foodgrid/types';
import type { Permission } from '../permissions';
import {
  ALLOW_SERVICE_KEY,
  IS_INTERNAL_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  TENANT_TYPES_KEY,
} from './constants';

/** No authentication required (a valid token is still parsed if present). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Only callable by other services with a valid service token. */
export const Internal = () => SetMetadata(IS_INTERNAL_KEY, true);

/** Accept either a user token or a service token. */
export const AllowService = () => SetMetadata(ALLOW_SERVICE_KEY, true);

/** Requires at least one of the platform roles (ADMIN always passes). */
export const Roles = (...roles: PlatformRole[]) => SetMetadata(ROLES_KEY, roles);

/** Requires an active tenant context, optionally of the given tenant types. */
export const RequireTenant = (...types: TenantType[]) => SetMetadata(TENANT_TYPES_KEY, types);

/** Requires all listed permissions (see permissions matrix). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthenticatedRequest {
  user?: AccessTokenClaims;
  service?: ServiceTokenClaims;
  headers: Record<string, string | string[] | undefined>;
}

function requestFrom(ctx: ExecutionContext): AuthenticatedRequest {
  if (ctx.getType() === 'ws') {
    return ctx.switchToWs().getClient().data ?? {};
  }
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>();
}

/** Injects the verified access-token claims. Throws if unauthenticated. */
export const CurrentUser = createParamDecorator(
  (field: keyof AccessTokenClaims | undefined, ctx: ExecutionContext) => {
    const user = requestFrom(ctx).user;
    if (!user) throw new UnauthorizedException();
    return field ? user[field] : user;
  },
);

/** Optional variant: returns undefined for anonymous callers on @Public routes. */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => requestFrom(ctx).user,
);

/** Injects the caller's active tenant id. Use with @RequireTenant(). */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const tenantId = requestFrom(ctx).user?.tenantId;
  if (!tenantId) throw new UnauthorizedException('No active tenant selected');
  return tenantId;
});

export const ServiceCaller = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => requestFrom(ctx).service,
);
