import type { Metadata } from 'next';
import { SalesReportView } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Sales reports' };

export default function Page() {
  return <SalesReportView />;
}
