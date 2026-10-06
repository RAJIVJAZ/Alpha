import type { Metadata } from 'next';
import { OrdersBoard } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return <OrdersBoard />;
}
