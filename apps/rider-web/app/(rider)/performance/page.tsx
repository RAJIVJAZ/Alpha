import type { Metadata } from 'next';
import { RiderPerformance } from '@foodgrid/ui/rider';

export const metadata: Metadata = { title: 'Incentives & attendance' };

export default function Page() {
  return <RiderPerformance />;
}
