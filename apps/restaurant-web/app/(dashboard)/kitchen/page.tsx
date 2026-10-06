import type { Metadata } from 'next';
import { KitchenDisplay } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Kitchen display' };

export default function Page() {
  return <KitchenDisplay />;
}
