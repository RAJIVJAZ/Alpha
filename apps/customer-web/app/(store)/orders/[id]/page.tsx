import type { Metadata } from 'next';
import { OrderView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderView id={id} />;
}
