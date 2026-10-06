import type { Metadata } from 'next';
import { PurchaseOrders } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Purchase orders' };

export default function Page() {
  return <PurchaseOrders />;
}
