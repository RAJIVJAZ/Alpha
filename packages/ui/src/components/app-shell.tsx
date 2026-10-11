'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { LucideIcon } from 'lucide-react';
import { Building2, Check, LogOut, Menu } from 'lucide-react';
import { toast, useSession } from '../lib/hooks';
import { cn } from '../lib/utils';
import { humanize } from '../lib/format';
import { Button } from './button';
import { SheetContent } from './dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './menu';
import { Avatar } from './misc';
import { ThemeToggle } from './theme';

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Match nested routes (default true). */
  prefix?: boolean;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
  window.location.assign('/login');
}

/** Renews the session so its token carries what changed since sign-in (a role, an approval), then opens the app. */
export async function reopenApp() {
  await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' }).catch(
    () => null,
  );
  window.location.assign('/');
}

export async function switchTenant(tenantId: string) {
  const res = await fetch('/api/auth/switch-tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId }),
    credentials: 'same-origin',
  });
  if (res.ok) return window.location.assign('/');
  // e.g. APP_ACCESS_DENIED: this app does not serve that business; the session stays as it was
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  toast.error(body?.message ?? 'Could not switch business');
}

function NavList({ nav, onNavigate }: { nav: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (item: NavItem) =>
    item.href === '/'
      ? pathname === '/'
      : item.prefix === false
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {nav.map((section, i) => (
        <div key={section.title ?? i} className="flex flex-col gap-0.5">
          {section.title ? (
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) => {
            const isActive = active(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
                  isActive
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {Icon ? <Icon aria-hidden /> : null}
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3">
      <span
        className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
        aria-hidden
      >
        FG
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-semibold">{name}</span>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </Link>
  );
}

/**
 * Dashboard frame shared by the merchant, supplier, vendor, rider and admin
 * apps: sidebar navigation (sheet on mobile), tenant switcher and user menu.
 */
export function AppShell({
  product,
  subtitle,
  nav,
  children,
  headerActions,
}: {
  product: string;
  subtitle?: string;
  nav: NavSection[];
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: session } = useSession();
  const active = session?.memberships.find((m) => m.tenantId === session.activeTenantId);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-card px-3 py-5 lg:flex">
        <Brand name={product} subtitle={subtitle} />
        <NavList nav={nav} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </DialogPrimitive.Trigger>
            <SheetContent side="left" aria-describedby={undefined}>
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Brand name={product} subtitle={subtitle} />
              <NavList nav={nav} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </DialogPrimitive.Root>
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {active ? (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-4" aria-hidden />
                <span className="truncate font-medium text-foreground">{active.tenantName}</span>
                <span className="hidden sm:inline">· {humanize(active.role)}</span>
              </span>
            ) : null}
          </div>
          {headerActions}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Account menu"
                className="rounded-full"
              >
                <Avatar name={session?.name ?? session?.phone ?? 'User'} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="block truncate font-medium text-foreground">
                  {session?.name ?? 'Signed in'}
                </span>
                <span className="block truncate">{session?.email ?? session?.phone}</span>
              </DropdownMenuLabel>
              {session && session.memberships.length > 1 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Switch business</DropdownMenuLabel>
                  {session.memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.tenantId}
                      onSelect={() => void switchTenant(m.tenantId)}
                    >
                      {m.tenantId === session.activeTenantId ? (
                        <Check />
                      ) : (
                        <span className="size-4" />
                      )}
                      <span className="truncate">{m.tenantName}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
