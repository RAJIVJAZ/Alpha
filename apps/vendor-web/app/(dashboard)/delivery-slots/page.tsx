import type { Metadata } from 'next';
import { DeliverySlots } from '@foodgrid/ui/seller';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Delivery slots' };

export default async function Page() {
  await requireKind('RETAILER', 'WHOLESALER');
  return <DeliverySlots />;
}
