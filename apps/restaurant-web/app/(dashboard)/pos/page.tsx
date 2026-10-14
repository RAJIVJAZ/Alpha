import type { Metadata } from 'next';
import { PointOfSale } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Point of sale' };

export default function Page() {
  return <PointOfSale />;
}
