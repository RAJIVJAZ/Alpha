import type { Metadata } from 'next';
import { Marketplace } from '@foodgrid/ui/marketplace';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Marketplace' };

export default async function Page() {
  // buying raw material and stock: retailers and wholesalers (suppliers sell only)
  await requireKind('WHOLESALER', 'RETAILER');
  return <Marketplace />;
}
