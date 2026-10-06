'use client';

import * as React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../lib/utils';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export const DropdownMenuItem = ({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item>) => (
  <DropdownPrimitive.Item
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus:bg-muted data-[disabled]:opacity-50 [&_svg]:size-4',
      className,
    )}
    {...props}
  />
);
export const DropdownMenuLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Label>) => (
  <DropdownPrimitive.Label
    className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
    {...props}
  />
);
export const DropdownMenuSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Separator>) => (
  <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn(
      'inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
);
export const TabsTrigger = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      'inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs',
      className,
    )}
    {...props}
  />
);
export const TabsContent = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('mt-4', className)} {...props} />
);

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}
