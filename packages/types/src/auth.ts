import type { PlatformRole, TenantRole, TenantType } from './enums';

/** Claims carried by RS256 access tokens issued by auth-service. */
export interface AccessTokenClaims {
  /** User id */
  sub: string;
  /** Platform-level roles (CUSTOMER, RIDER, ADMIN ...) */
  roles: PlatformRole[];
  /** Active tenant (business organisation) selected by the user, if any. */
  tenantId?: string;
  tenantType?: TenantType;
  tenantRole?: TenantRole;
  /** Outlets the member may operate; empty/undefined = all outlets of the tenant. */
  outletIds?: string[];
  /** Session (refresh-token family) id — used for server-side revocation. */
  sid: string;
  name?: string;
  phone?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

/** Claims of HS256 service-to-service tokens. */
export interface ServiceTokenClaims {
  /** Calling service name */
  sub: string;
  typ: 'service';
  /** Optional end-user on whose behalf the call is made */
  onBehalfOf?: string;
  tenantId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface TenantMembershipSummary {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantStatus: string;
  role: TenantRole;
  outletIds: string[];
}

export interface SessionUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  roles: PlatformRole[];
  memberships: TenantMembershipSummary[];
  activeTenantId?: string;
}

export interface LoginResponse {
  user: SessionUser;
  tokens: AuthTokens;
  isNewUser: boolean;
}
