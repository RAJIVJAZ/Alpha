import type { Metadata } from 'next';
import { AccountView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Account' };

export default function Page() {
  return <AccountView />;
}
