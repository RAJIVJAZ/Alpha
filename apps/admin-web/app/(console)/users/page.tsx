import type { Metadata } from 'next';
import { UsersAdmin } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Users' };

export default async function Page() {
  await requirePermission('platform:users:read');
  return <UsersAdmin />;
}
