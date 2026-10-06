import type { Metadata } from 'next';
import { PushCampaigns } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Push notifications' };

export default async function Page() {
  await requirePermission('platform:notifications');
  return <PushCampaigns />;
}
