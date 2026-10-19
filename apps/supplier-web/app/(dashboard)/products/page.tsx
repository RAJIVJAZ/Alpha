import type { Metadata } from 'next';
import { ProductCatalog } from '@foodgrid/ui/seller';

export const metadata: Metadata = { title: 'Products & stock' };

export default function Page() {
  return (
    <ProductCatalog
      title="Products & stock"
      description="Catalogue, price tiers, MOQ, pack sizes and stock for restaurants, food carts and shops buying on FoodGrid"
    />
  );
}
