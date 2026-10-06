import type { Metadata } from 'next';
import { ProductionPlanner } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Production' };

export default function Page() {
  return <ProductionPlanner procurementHref="/procurement" />;
}
