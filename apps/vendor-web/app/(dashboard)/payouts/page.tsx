import type { Metadata } from 'next';
import { SettlementsView } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Payouts' };

export default function Page() {
  return <SettlementsView />;
}
