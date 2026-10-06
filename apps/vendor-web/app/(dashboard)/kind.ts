import { redirect } from 'next/navigation';
import { getSession } from '@foodgrid/auth/next';

export type VendorKind = 'FOOD_CART' | 'RETAILER' | 'WHOLESALER';
const KINDS: VendorKind[] = ['FOOD_CART', 'RETAILER', 'WHOLESALER'];

/** The signed-in business's type; anyone else goes back to the login page. */
export async function vendorKind(): Promise<VendorKind> {
  const session = await getSession();
  const kind = session?.claims.tenantType as VendorKind | undefined;
  if (!kind || !KINDS.includes(kind)) redirect('/login');
  return kind;
}

/** Pages that exist for some business types only. */
export async function requireKind(...allowed: VendorKind[]): Promise<VendorKind> {
  const kind = await vendorKind();
  if (!allowed.includes(kind)) redirect('/');
  return kind;
}
