import type { Metadata } from 'next';
import { MenuManager } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Menu' };

export default function Page() {
  return <MenuManager />;
}
