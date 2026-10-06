import type { Metadata } from 'next';
import { DealerNetwork } from '@foodgrid/ui/seller';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'Dealers' };

export default async function Page() {
  await requireKind('WHOLESALER');
  return <DealerNetwork />;
}
