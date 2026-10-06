import type { Metadata } from 'next';
import { RidersAdmin } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Riders' };

export default async function Page() {
  await requirePermission('platform:riders');
  return <RidersAdmin />;
}
