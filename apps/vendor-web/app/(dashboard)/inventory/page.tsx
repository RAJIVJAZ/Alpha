import type { Metadata } from 'next';
import { InventoryManager } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Inventory' };

export default async function Page() {
  await requireKind('FOOD_CART');
  return <InventoryManager />;
}
