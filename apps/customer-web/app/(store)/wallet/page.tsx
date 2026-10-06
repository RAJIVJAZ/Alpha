import type { Metadata } from 'next';
import { WalletView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Wallet' };

export default function Page() {
  return <WalletView />;
}
