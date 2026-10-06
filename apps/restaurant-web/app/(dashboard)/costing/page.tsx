import type { Metadata } from 'next';
import { CostingView } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Costing' };

export default function Page() {
  return <CostingView />;
}
