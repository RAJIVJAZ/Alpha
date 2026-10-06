import type { Metadata } from 'next';
import { ProductCatalog } from '@foodgrid/ui/seller';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Products & stock' };

export default async function Page() {
  await requireKind('RETAILER', 'WHOLESALER');
  return <ProductCatalog title="Products & stock" />;
}
