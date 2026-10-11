import type { Metadata } from 'next';
import { Marketplace } from '@foodgrid/ui/marketplace';

export const metadata: Metadata = { title: 'Marketplace' };

export default function Page() {
  return <Marketplace />;
}
