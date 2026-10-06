import type { Metadata } from 'next';
import { RiderDuty } from '@foodgrid/ui/rider';

export const metadata: Metadata = { title: 'Duty' };

export default function Page() {
  return <RiderDuty />;
}
