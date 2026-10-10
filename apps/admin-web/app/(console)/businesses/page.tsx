import type { Metadata } from 'next';
import { TenantsAdmin } from '@foodgrid/ui/admin';
import { requirePermission, staffPermissions } from '../access';

export const metadata: Metadata = { title: 'Businesses' };

export default async function Page() {
  await requirePermission('platform:users:read');
  // commission rules live in payment-service, behind platform:finance
  return <TenantsAdmin commission={(await staffPermissions()).includes('platform:finance')} />;
}
