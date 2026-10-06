import type { Metadata } from 'next';
import { SettlementsView } from '@foodgrid/ui/seller';

export const metadata: Metadata = { title: 'Payouts' };

export default function Page() {
  return (
    <SettlementsView description="Weekly payouts: your sales plus the GST you charged, less commission, TCS and TDS" />
  );
}
