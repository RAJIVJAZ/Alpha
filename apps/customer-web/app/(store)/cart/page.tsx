import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CartView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Checkout' };

export default function CartPage() {
  return (
    <Suspense>
      <CartView />
    </Suspense>
  );
}
