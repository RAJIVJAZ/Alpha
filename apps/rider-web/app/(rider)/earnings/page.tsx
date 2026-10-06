import type { Metadata } from 'next';
import { RiderEarnings } from '@foodgrid/ui/rider';

export const metadata: Metadata = { title: 'Earnings' };

export default function Page() {
  return <RiderEarnings />;
}
