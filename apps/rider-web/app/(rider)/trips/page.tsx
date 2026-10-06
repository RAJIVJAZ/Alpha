import type { Metadata } from 'next';
import { RiderHistory } from '@foodgrid/ui/rider';

export const metadata: Metadata = { title: 'Trips' };

export default function Page() {
  return <RiderHistory />;
}
