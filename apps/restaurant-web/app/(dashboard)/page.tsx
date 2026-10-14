import type { Metadata } from 'next';
import { MerchantOverview, PointOfSale } from '@foodgrid/ui/merchant';
import { foodKind } from './kind';

export const metadata: Metadata = { title: 'Home' };

export default async function Page() {
  // carts sell from a phone at the counter: the point of sale is their home
  if ((await foodKind()) === 'FOOD_CART') return <PointOfSale />;
  return (
    <MerchantOverview
      links={{
        orders: '/orders',
        inventory: '/inventory',
        procurement: '/procurement',
        purchaseOrders: '/purchase-orders',
      }}
    />
  );
}
