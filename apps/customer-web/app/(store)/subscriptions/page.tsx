import type { Metadata } from 'next';
import { SubscriptionsView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Meal plans' };

export default function Page() {
  return <SubscriptionsView />;
}
