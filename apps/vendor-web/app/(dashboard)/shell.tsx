'use client';

import {
  BarChart3,
  BookOpenText,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  Map as MapIcon,
  MapPinned,
  Package,
  QrCode,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';
import { OutletProvider, useNavForRole } from '@foodgrid/ui/merchant';
import type { VendorKind } from './kind';

const NAV: Record<VendorKind, NavSection[]> = {
  FOOD_CART: [
    {
      items: [
        { label: 'Point of sale', href: '/', icon: Store, prefix: false },
        { label: 'Orders', href: '/orders', icon: ClipboardList },
        { label: 'Daily sales', href: '/sales', icon: BarChart3 },
      ],
    },
    {
      title: 'Stock',
      items: [
        { label: 'Inventory', href: '/inventory', icon: Package },
        { label: 'Procurement', href: '/procurement', icon: ShoppingCart },
        { label: 'Purchase orders', href: '/purchase-orders', icon: Truck },
      ],
    },
    {
      title: 'Cart',
      items: [
        { label: 'Menu', href: '/menu', icon: BookOpenText },
        { label: 'QR ordering', href: '/qr', icon: QrCode },
        { label: 'Payouts', href: '/payouts', icon: Wallet },
      ],
    },
  ],
  RETAILER: [
    {
      items: [
        { label: 'Retail analytics', href: '/', icon: LayoutDashboard, prefix: false },
        { label: 'Orders', href: '/orders', icon: ClipboardList },
        { label: 'Products & stock', href: '/products', icon: Package },
        { label: 'Delivery slots', href: '/delivery-slots', icon: CalendarClock },
        { label: 'Delivery zones', href: '/delivery-zones', icon: MapPinned },
        { label: 'Payouts', href: '/payouts', icon: Wallet },
      ],
    },
  ],
  WHOLESALER: [
    {
      items: [
        { label: 'Overview', href: '/', icon: LayoutDashboard, prefix: false },
        { label: 'Orders & deliveries', href: '/orders', icon: ClipboardList },
        { label: 'Products & bulk pricing', href: '/products', icon: Package },
      ],
    },
    {
      title: 'Distribution',
      items: [
        { label: 'Dealers', href: '/dealers', icon: Users },
        { label: 'Territories', href: '/territories', icon: MapIcon },
        { label: 'Delivery zones', href: '/delivery-zones', icon: MapPinned },
        { label: 'Payouts', href: '/payouts', icon: Wallet },
      ],
    },
  ],
};

const SUBTITLE: Record<VendorKind, string> = {
  FOOD_CART: 'Food cart',
  RETAILER: 'Retail store',
  WHOLESALER: 'Wholesale',
};

export function Shell({ kind, children }: { kind: VendorKind; children: React.ReactNode }) {
  const nav = useNavForRole(NAV[kind], '/sales');
  const shell = (
    <AppShell product="FoodGrid" subtitle={SUBTITLE[kind]} nav={nav}>
      {children}
    </AppShell>
  );
  // outlets (and the outlet picker) exist only for carts; sellers have none
  return kind === 'FOOD_CART' ? <OutletProvider>{shell}</OutletProvider> : shell;
}
