import type { Metadata } from 'next';
import { ProcurementCenter } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Procurement' };

export default async function Page() {
  await requireKind('FOOD_CART');
  return <ProcurementCenter purchaseOrdersHref="/purchase-orders" />;
}
