import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminOverview } from '@foodgrid/ui/admin';
import { staffPermissions } from './access';

export const metadata: Metadata = { title: 'Overview' };

// staff without analytics land on the first screen they can use
const FALLBACK: [string, string][] = [
  ['platform:approvals', '/approvals'],
  ['platform:finance', '/finance'],
  ['platform:fraud', '/fraud'],
  ['platform:users:read', '/users'],
];

export default async function Page() {
  const perms = await staffPermissions();
  if (!perms.includes('platform:analytics'))
    redirect(FALLBACK.find(([p]) => perms.includes(p as never))?.[1] ?? '/login');
  return <AdminOverview approvalsHref="/approvals" />;
}
