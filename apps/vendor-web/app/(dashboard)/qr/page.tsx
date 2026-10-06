import type { Metadata } from 'next';
import { QrTables } from '@foodgrid/ui/merchant';
import { requireKind } from '../kind';

export const metadata: Metadata = { title: 'QR ordering' };

export default async function Page() {
  await requireKind('FOOD_CART');
  return <QrTables />;
}
