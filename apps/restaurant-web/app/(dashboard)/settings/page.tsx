import type { Metadata } from 'next';
import { OutletSettings } from '@foodgrid/ui/merchant';
import { foodKind } from '../kind';

export const metadata: Metadata = { title: 'Outlet settings' };

export default async function Page() {
  return <OutletSettings kind={await foodKind()} />;
}
