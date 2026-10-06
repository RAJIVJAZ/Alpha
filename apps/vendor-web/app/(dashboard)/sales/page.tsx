import type { Metadata } from 'next';
import { SalesReportView } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Daily sales' };

export default async function Page() {
  await requireKind('FOOD_CART');
  return <SalesReportView />;
}
