import type { Metadata } from 'next';
import { StaffManager } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Staff' };

export default function Page() {
  return <StaffManager />;
}
