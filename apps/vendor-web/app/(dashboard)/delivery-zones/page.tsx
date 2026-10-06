import type { Metadata } from 'next';
import { DeliveryZones } from '@foodgrid/ui/seller';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Delivery zones' };

export default async function Page() {
  await requireKind('RETAILER', 'WHOLESALER');
  return <DeliveryZones />;
}
