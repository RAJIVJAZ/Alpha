import type { Metadata } from 'next';
import { FraudReview } from '@foodgrid/ui/admin';
import { requirePermission } from '../access';

export const metadata: Metadata = { title: 'Fraud review' };

export default async function Page() {
  await requirePermission('platform:fraud');
  return <FraudReview />;
}
