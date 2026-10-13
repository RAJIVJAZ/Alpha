'use client';

import {
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  Map as MapIcon,
  MapPinned,
  Package,
  ShoppingBasket,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';
import { useNavForRole } from '@foodgrid/ui/merchant';
import type { SellerKind } from './kind';

/**
 * One Product Seller Portal for suppliers (distributors, manufacturers, packaging and
 * ingredient suppliers), wholesalers and retailers. Everyone sells with the same catalogue,
 * bulk pricing, orders, delivery slots and zones; distribution tools are for wholesale and
 * supply, and buying on the marketplace for retailers and wholesalers.
 */
function navFor(kind: SellerKind): NavSection[] {
  const distribution = kind !== 'RETAILER';
  return [
    {
      items: [
        {
          label: kind === 'RETAILER' ? 'Retail analytics' : 'Overview',
          href: '/',
          icon: LayoutDashboard,
          prefix: false,
        },
        { label: 'Orders & deliveries', href: '/orders', icon: ClipboardList },
        {
          label: kind === 'RETAILER' ? 'Products & stock' : 'Products & bulk pricing',
          href: '/products',
          icon: Package,
        },
        { label: 'Delivery slots', href: '/delivery-slots', icon: CalendarClock },
        { label: 'Delivery zones', href: '/delivery-zones', icon: MapPinned },
        { label: 'Payouts', href: '/payouts', icon: Wallet },
      ],
    },
    ...(distribution
      ? [
          {
            title: 'Distribution',
            items: [
              { label: 'Dealers', href: '/dealers', icon: Users },
              { label: 'Territories', href: '/territories', icon: MapIcon },
            ],
          },
        ]
      : []),
    ...(kind !== 'SUPPLIER'
      ? [
          {
            title: 'Buying',
            items: [{ label: 'Marketplace', href: '/marketplace', icon: ShoppingBasket }],
          },
        ]
      : []),
  ];
}

const SUBTITLE: Record<SellerKind, string> = {
  SUPPLIER: 'Supplier',
  WHOLESALER: 'Wholesale',
  RETAILER: 'Retail store',
};

export function Shell({ kind, children }: { kind: SellerKind; children: React.ReactNode }) {
  const nav = useNavForRole(navFor(kind), { '/marketplace': 'procurement:read' });
  return (
    <AppShell product="FoodGrid" subtitle={SUBTITLE[kind]} nav={nav}>
      {children}
    </AppShell>
  );
}
