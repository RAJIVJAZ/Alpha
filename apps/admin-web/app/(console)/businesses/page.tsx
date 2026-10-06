import type { Metadata } from 'next';
import { TenantsAdmin } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Businesses' };

export default async function Page() {
  await requirePermission('platform:users:read');
  return <TenantsAdmin />;
}
