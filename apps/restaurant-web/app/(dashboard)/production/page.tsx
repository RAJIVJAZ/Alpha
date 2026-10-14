import type { Metadata } from 'next';
import { ProductionPlanner } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Production' };

export default async function Page() {
  // carts cook at one counter: no kitchen screens or production plans
  await requireKind('RESTAURANT');
  return <ProductionPlanner procurementHref="/procurement" />;
}
