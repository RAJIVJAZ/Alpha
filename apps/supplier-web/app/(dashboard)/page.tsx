import type { Metadata } from 'next';
import { SellerOverview } from '@foodgrid/ui/seller';
import { sellerKind } from './kind';

export const metadata: Metadata = { title: 'Overview' };

export default async function Page() {
  const kind = await sellerKind();
  return (
    <SellerOverview
      title={kind === 'RETAILER' ? 'Retail analytics' : 'Overview'}
      links={{ orders: '/orders', products: '/products' }}
    />
  );
}
