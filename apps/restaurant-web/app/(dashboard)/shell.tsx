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
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';
import {
  OutletOpenSwitch,
  OutletProvider,
  useNavForRole,
  type FoodBusinessKind,
} from '@foodgrid/ui/merchant';

/**
 * One Food Seller Portal for restaurants and food carts: the same screens, with the nav
 * trimmed for carts (phone-first point of sale, no kitchen display or production planning).
 */
const NAV: Record<FoodBusinessKind, NavSection[]> = {
  RESTAURANT: [
    {
      items: [
        { label: 'Overview', href: '/', icon: LayoutDashboard, prefix: false },
        { label: 'Orders', href: '/orders', icon: ClipboardList },
        { label: 'Kitchen display', href: '/kitchen', icon: ChefHat },
        { label: 'Point of sale', href: '/pos', icon: Store },
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
        { label: 'Marketplace', href: '/marketplace', icon: ShoppingBasket },
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
        { label: 'Outlet settings', href: '/settings', icon: Settings },
      ],
    },
  ],
  FOOD_CART: [
    {
      items: [
        { label: 'Point of sale', href: '/', icon: Store, prefix: false },
        { label: 'Orders', href: '/orders', icon: ClipboardList },
        { label: 'Daily sales', href: '/reports', icon: BarChart3 },
        { label: 'Menu', href: '/menu', icon: BookOpenText },
      ],
    },
    {
      title: 'Stock',
      items: [
        { label: 'Inventory', href: '/inventory', icon: Package },
        { label: 'Recipes & costs', href: '/costing', icon: Receipt },
        { label: 'Procurement', href: '/procurement', icon: ShoppingCart },
        { label: 'Purchase orders', href: '/purchase-orders', icon: Truck },
        { label: 'Marketplace', href: '/marketplace', icon: ShoppingBasket },
      ],
    },
    {
      title: 'Cart',
      items: [
        { label: 'QR ordering', href: '/qr', icon: QrCode },
        { label: 'Reviews', href: '/reviews', icon: MessageSquareText },
        { label: 'Payouts', href: '/payouts', icon: Wallet },
        { label: 'Staff', href: '/staff', icon: Users },
        { label: 'Cart settings', href: '/settings', icon: Settings },
      ],
    },
  ],
};

const SUBTITLE: Record<FoodBusinessKind, string> = {
  RESTAURANT: 'Restaurant',
  FOOD_CART: 'Food cart',
};

export function Shell({ kind, children }: { kind: FoodBusinessKind; children: React.ReactNode }) {
  const nav = useNavForRole(NAV[kind], {
    '/reports': 'reports:read',
    '/marketplace': 'procurement:read',
    '/pos': 'pos:operate', // billing; a cart's home shows who may bill instead
  });
  return (
    <OutletProvider>
      <AppShell
        product="FoodGrid"
        subtitle={SUBTITLE[kind]}
        nav={nav}
        headerActions={<OutletOpenSwitch />}
      >
        {children}
      </AppShell>
    </OutletProvider>
  );
}
