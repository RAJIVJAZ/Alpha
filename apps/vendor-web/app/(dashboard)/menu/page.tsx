import type { Metadata } from 'next';
import { MenuManager } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Menu' };

export default async function Page() {
  await requireKind('FOOD_CART');
  return <MenuManager />;
}
