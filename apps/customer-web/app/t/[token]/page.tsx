import type { Metadata } from 'next';
import { TableOrderView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Order at your table' };

export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="px-4 py-5">
      <TableOrderView token={token} />
    </main>
  );
}
