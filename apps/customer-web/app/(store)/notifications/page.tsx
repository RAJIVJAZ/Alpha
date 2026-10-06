import type { Metadata } from 'next';
import { NotificationsView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <NotificationsView />;
}
