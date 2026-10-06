import type { Metadata } from 'next';
import { SellerOverview } from '@foodgrid/ui/seller';

export const metadata: Metadata = { title: 'Overview' };

export default function Page() {
  return <SellerOverview links={{ orders: '/orders', products: '/products' }} />;
}
