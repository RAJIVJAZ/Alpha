import type { Metadata } from 'next';
import { ArrowRight, Package, Store } from 'lucide-react';
import { AuthScreen } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Choose your portal' };
// the portal addresses are read when the page is requested, so one build serves every environment
export const dynamic = 'force-dynamic';

/**
 * FoodGrid Business has moved into two portals: food carts sell from the Food Seller Portal
 * with restaurants, and retailers and wholesalers from the Product Seller Portal with
 * suppliers. This app only points old links and bookmarks there.
 */
export default function Page() {
  const portals = [
    {
      href: process.env.FOOD_SELLER_PORTAL_URL ?? 'https://partner.foodgrid.in',
      icon: Store,
      title: 'Food Seller Portal',
      who: 'Restaurants, cafés, cloud kitchens and food carts',
    },
    {
      href: process.env.PRODUCT_SELLER_PORTAL_URL ?? 'https://supplier.foodgrid.in',
      icon: Package,
      title: 'Product Seller Portal',
      who: 'Suppliers, distributors, manufacturers, wholesalers and retailers',
    },
  ];
  return (
    <AuthScreen>
      <div className="grid w-full max-w-sm gap-4">
        <div>
          <h1 className="text-xl font-semibold">FoodGrid Business has moved</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in where your business sells. Your account and data are the same.
          </p>
        </div>
        {portals.map((p) => (
          <a
            key={p.title}
            href={p.href}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-soft hover:bg-muted"
          >
            <p.icon className="size-6 shrink-0 text-primary-strong" aria-hidden />
            <span className="grid flex-1">
              <span className="font-medium">{p.title}</span>
              <span className="text-sm text-muted-foreground">{p.who}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          </a>
        ))}
      </div>
    </AuthScreen>
  );
}
