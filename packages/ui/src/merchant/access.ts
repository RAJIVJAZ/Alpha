'use client';

import type { TenantRole } from '@foodgrid/types';
import { useSession } from '../lib/hooks';

/**
 * Roles holding reports:read, i.e. allowed to see sales and revenue (GET pos/summary
 * and the analytics reports). Mirrors TENANT_ROLE_PERMISSIONS in @foodgrid/auth, which
 * this package cannot import; the API enforces the real rule, this only hides screens.
 */
const REPORT_ROLES: readonly TenantRole[] = [
  'OWNER',
  'MANAGER',
  'ACCOUNTANT',
  'PROCUREMENT_MANAGER',
];

/** Whether the signed-in member's role in the active business may see sales figures. */
export function useCanSeeSales(): boolean {
  const { data: session } = useSession();
  const role = session?.memberships.find((m) => m.tenantId === session.activeTenantId)?.role;
  return !!role && REPORT_ROLES.includes(role);
}
