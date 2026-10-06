import type { Metadata } from 'next';
import { ContentManager } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Content' };

export default async function Page() {
  await requirePermission('platform:content');
  return <ContentManager />;
}
