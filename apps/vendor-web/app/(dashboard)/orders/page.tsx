import type { Metadata } from 'next';
import { OrdersBoard } from '@foodgrid/ui/merchant';
import { SellerOrders } from '@foodgrid/ui/seller';
import { vendorKind } from '../kind';

export const metadata: Metadata = { title: 'Orders' };

export default async function Page() {
  return (await vendorKind()) === 'FOOD_CART' ? <OrdersBoard /> : <SellerOrders />;
}
