import type { Metadata } from 'next';
import { ProcurementCenter } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Procurement' };

export default function Page() {
  return <ProcurementCenter purchaseOrdersHref="/purchase-orders" />;
}
