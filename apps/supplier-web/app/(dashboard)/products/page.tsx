import type { Metadata } from 'next';
import { ProductCatalog } from '@foodgrid/ui/seller';

export const metadata: Metadata = { title: 'Products & stock' };

export default function Page() {
  return (
    <ProductCatalog
      title="Products & stock"
      description="Catalogue, pricing, MOQ and stock for restaurants buying on FoodGrid"
    />
  );
}
