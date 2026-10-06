import type { Metadata } from 'next';
import { OrdersView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Your orders' };

export default function OrdersPage() {
  return <OrdersView />;
}
