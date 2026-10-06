import type { Metadata } from 'next';
import { MerchantOverview } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Overview' };

export default function Page() {
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
