'use client';

import {
  BadgeCheck,
  BarChart3,
  Bell,
  Bike,
  Building2,
  FileText,
  LayoutDashboard,
  Landmark,
  Newspaper,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { AppShell, type NavSection } from '@foodgrid/ui';

type Item = NavSection['items'][number] & { permission: string };
const SECTIONS: { title?: string; items: Item[] }[] = [
  {
    items: [
      {
        label: 'Overview',
        href: '/',
        icon: LayoutDashboard,
        prefix: false,
        permission: 'platform:analytics',
      },
      { label: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'platform:analytics' },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Approvals',
        href: '/approvals',
        icon: BadgeCheck,
        permission: 'platform:approvals',
      },
      {
        label: 'Businesses',
        href: '/businesses',
        icon: Building2,
        permission: 'platform:users:read',
      },
      { label: 'Users', href: '/users', icon: Users, permission: 'platform:users:read' },
      { label: 'Riders', href: '/riders', icon: Bike, permission: 'platform:riders' },
      { label: 'Fraud review', href: '/fraud', icon: ShieldAlert, permission: 'platform:fraud' },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        label: 'Settlements & commission',
        href: '/finance',
        icon: Landmark,
        permission: 'platform:finance',
      },
      { label: 'GST', href: '/gst', icon: FileText, permission: 'platform:finance' },
    ],
  },
  {
    title: 'Engagement',
    items: [
      {
        label: 'Push notifications',
        href: '/push',
        icon: Bell,
        permission: 'platform:notifications',
      },
      { label: 'Content', href: '/content', icon: Newspaper, permission: 'platform:content' },
    ],
  },
];

export function Shell({
  permissions,
  children,
}: {
  permissions: string[];
  children: React.ReactNode;
}) {
  const nav: NavSection[] = SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter((i) => permissions.includes(i.permission)),
  })).filter((s) => s.items.length);
  return (
    <AppShell product="FoodGrid" subtitle="Admin" nav={nav}>
      {children}
    </AppShell>
  );
}
