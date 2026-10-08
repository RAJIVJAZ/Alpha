import { canAccessOutlet } from '@foodgrid/auth';
import type { AccessTokenClaims } from '@foodgrid/types';
import { forbidden } from '@foodgrid/utils';

/** The caller: staff claims (outletIds may limit them to some outlets), or null for system jobs. */
export type OutletActor = Pick<AccessTokenClaims, 'outletIds'> | null | undefined;

export const hasOutletAccess = (user: OutletActor, outletId: string) =>
  !user || canAccessOutlet(user, outletId);

export function assertOutletAccess(user: OutletActor, outletId: string) {
  if (!hasOutletAccess(user, outletId))
    throw forbidden('You do not have access to this outlet', 'OUTLET_FORBIDDEN');
}

/** Outlet filter for queries; outlet-scoped staff default to their own outlets. */
export function outletScope(user: OutletActor, outletId?: string) {
  if (outletId) {
    assertOutletAccess(user, outletId);
    return { outletId };
  }
  return user?.outletIds?.length ? { outletId: { in: user.outletIds } } : {};
}
