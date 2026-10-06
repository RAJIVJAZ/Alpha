import type { Metadata } from 'next';
import { ApprovalsQueue } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Approvals' };

export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requirePermission('platform:approvals');
  return <ApprovalsQueue initialType={(await searchParams).type ?? ''} />;
}
