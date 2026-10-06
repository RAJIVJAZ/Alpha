import type { Metadata } from 'next';
import { QrTables } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'QR ordering' };

export default function Page() {
  return <QrTables />;
}
