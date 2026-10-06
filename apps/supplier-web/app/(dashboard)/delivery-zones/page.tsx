import type { Metadata } from 'next';
import { DeliveryZones } from '@foodgrid/ui/seller';

export const metadata: Metadata = { title: 'Delivery zones' };

export default function Page() {
  return <DeliveryZones />;
}
