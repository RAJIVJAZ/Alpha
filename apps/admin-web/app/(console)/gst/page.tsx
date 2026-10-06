import type { Metadata } from 'next';
import { GstReports } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'GST' };

export default async function Page() {
  await requirePermission('platform:finance');
  return <GstReports />;
}
