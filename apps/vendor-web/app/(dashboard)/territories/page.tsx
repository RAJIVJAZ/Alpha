import type { Metadata } from 'next';
import { Territories } from '@foodgrid/ui/seller';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Territories' };

export default async function Page() {
  await requireKind('WHOLESALER');
  return <Territories />;
}
