import type { Metadata } from 'next';
import { InventoryManager } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Inventory' };

export default function Page() {
  return <InventoryManager />;
}
