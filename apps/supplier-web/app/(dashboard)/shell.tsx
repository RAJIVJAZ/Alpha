'use client';

import { ClipboardList, LayoutDashboard, MapPinned, Package, Wallet } from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Overview', href: '/', icon: LayoutDashboard, prefix: false },
      { label: 'Orders', href: '/orders', icon: ClipboardList },
      { label: 'Products & stock', href: '/products', icon: Package },
      { label: 'Delivery zones', href: '/delivery-zones', icon: MapPinned },
      { label: 'Payouts', href: '/payouts', icon: Wallet },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell product="FoodGrid" subtitle="Supplier" nav={NAV}>
      {children}
    </AppShell>
  );
}
