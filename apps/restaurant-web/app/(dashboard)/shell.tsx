'use client';

import {
  BarChart3,
  BookOpenText,
  ChefHat,
  ClipboardList,
  Factory,
  LayoutDashboard,
  MessageSquareText,
  Package,
  QrCode,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';
import { OutletProvider, useNavForRole } from '@foodgrid/ui/merchant';

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Overview', href: '/', icon: LayoutDashboard, prefix: false },
      { label: 'Orders', href: '/orders', icon: ClipboardList },
      { label: 'Kitchen display', href: '/kitchen', icon: ChefHat },
    ],
  },
  {
    title: 'Back of house',
    items: [
      { label: 'Menu', href: '/menu', icon: BookOpenText },
      { label: 'Inventory', href: '/inventory', icon: Package },
      { label: 'Production', href: '/production', icon: Factory },
      { label: 'Costing', href: '/costing', icon: Receipt },
      { label: 'Procurement', href: '/procurement', icon: ShoppingCart },
      { label: 'Purchase orders', href: '/purchase-orders', icon: Truck },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Sales reports', href: '/reports', icon: BarChart3 },
      { label: 'Payouts', href: '/payouts', icon: Wallet },
      { label: 'Reviews', href: '/reviews', icon: MessageSquareText },
      { label: 'QR ordering', href: '/qr', icon: QrCode },
      { label: 'Staff', href: '/staff', icon: Users },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavForRole(NAV, '/reports');
  return (
    <OutletProvider>
      <AppShell product="FoodGrid" subtitle="Restaurant" nav={nav}>
        {children}
      </AppShell>
    </OutletProvider>
  );
}
