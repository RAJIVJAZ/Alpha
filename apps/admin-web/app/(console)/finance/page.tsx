import type { Metadata } from 'next';
import { FinanceAdmin } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Finance' };

export default async function Page() {
  await requirePermission('platform:finance');
  return <FinanceAdmin />;
}
