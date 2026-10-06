import { Storefront } from '@foodgrid/ui/customer';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <Storefront>{children}</Storefront>;
}
