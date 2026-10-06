import type { Metadata } from 'next';
import { SellerOrders } from '@foodgrid/ui/seller';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return <SellerOrders />;
}
