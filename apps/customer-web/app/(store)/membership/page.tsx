import type { Metadata } from 'next';
import { MembershipView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'FoodGrid One' };

export default function Page() {
  return <MembershipView />;
}
