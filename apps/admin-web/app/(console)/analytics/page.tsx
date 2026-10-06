import type { Metadata } from 'next';
import { PlatformAnalytics } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Analytics' };

export default async function Page() {
  await requirePermission('platform:analytics');
  return <PlatformAnalytics />;
}
