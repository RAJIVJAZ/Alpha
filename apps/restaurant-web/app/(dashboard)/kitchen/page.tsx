import type { Metadata } from 'next';
import { KitchenDisplay } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Kitchen display' };

export default async function Page() {
  // carts cook at one counter: no kitchen screens or production plans
  await requireKind('RESTAURANT');
  return <KitchenDisplay />;
}
