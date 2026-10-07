'use client';

import type { NavSection } from '../components/app-shell';
import { useSession } from '../lib/hooks';

/**
 * Whether the member's role in the active business has a permission (e.g. reports:read).
 * Only hides screens the API would refuse anyway; the services enforce the real rule.
 */
export function useCan(permission: string): boolean {
  const { data: session } = useSession();
  const active = session?.memberships.find((m) => m.tenantId === session.activeTenantId);
  return !!active?.permissions?.includes(permission);
}

/** Sales and revenue (pos/summary, analytics reports) need reports:read. */
export const useCanSeeSales = () => useCan('reports:read');

/** The nav without the sales-report entry when the member's role can't see sales. */
export function useNavForRole(nav: NavSection[], salesHref: string): NavSection[] {
  const canSeeSales = useCanSeeSales();
  if (canSeeSales) return nav;
  return nav.map((s) => ({ ...s, items: s.items.filter((i) => i.href !== salesHref) }));
}
