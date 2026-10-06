import type { Metadata } from 'next';
import { PurchaseOrders } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Purchase orders' };

export default async function Page() {
  await requireKind('FOOD_CART');
  return <PurchaseOrders />;
}
