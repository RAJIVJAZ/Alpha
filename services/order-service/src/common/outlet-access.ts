import type { AccessTokenClaims } from '@foodgrid/types';
import { canAccessOutlet } from '@foodgrid/auth';
import { forbidden, notFound } from '@foodgrid/utils';
import type { PrismaService } from '@foodgrid/database/nest';

/** Loads an outlet owned by the caller's tenant, honouring outlet-scoped staff. */
export async function assertOutletAccess(prisma: PrismaService, user: AccessTokenClaims, outletId: string) {
  const outlet = await prisma.forTenant(user.tenantId!).outlet.findUnique({ where: { id: outletId } });
  if (!outlet) throw notFound('Outlet', outletId);
  if (!canAccessOutlet(user, outletId)) throw forbidden('You do not have access to this outlet', 'OUTLET_FORBIDDEN');
  return outlet;
}

/** Outlet filter for list queries made by outlet-scoped staff. */
export function outletScope(user: AccessTokenClaims, outletId?: string) {
  if (outletId) {
    if (!canAccessOutlet(user, outletId)) throw forbidden('You do not have access to this outlet', 'OUTLET_FORBIDDEN');
    return { outletId };
  }
  return user.outletIds?.length ? { outletId: { in: user.outletIds } } : {};
}
