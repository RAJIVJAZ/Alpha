'use client';

import { Bike, History, Map as MapIcon, Trophy, Wallet } from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Duty', href: '/', icon: Bike, prefix: false },
      { label: 'Earnings & wallet', href: '/earnings', icon: Wallet },
      { label: 'Demand map', href: '/demand', icon: MapIcon },
      { label: 'Incentives & attendance', href: '/performance', icon: Trophy },
      { label: 'Trips', href: '/trips', icon: History },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell product="FoodGrid" subtitle="Rider" nav={NAV}>
      {children}
    </AppShell>
  );
}
