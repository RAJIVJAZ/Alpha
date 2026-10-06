import type { Metadata } from 'next';
import { DemandMap } from '@foodgrid/ui/rider';

export const metadata: Metadata = { title: 'Demand map' };

export default function Page() {
  return <DemandMap />;
}
