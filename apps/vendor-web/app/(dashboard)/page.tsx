import type { Metadata } from 'next';
import { PointOfSale } from '@foodgrid/ui/merchant';
import { SellerOverview } from '@foodgrid/ui/seller';
import { vendorKind } from './kind';

export const metadata: Metadata = { title: 'Home' };

export default async function Page() {
  const kind = await vendorKind();
  if (kind === 'FOOD_CART') return <PointOfSale />;
  return (
    <SellerOverview
      title={kind === 'RETAILER' ? 'Retail analytics' : 'Overview'}
      links={{ orders: '/orders', products: '/products' }}
    />
  );
}
