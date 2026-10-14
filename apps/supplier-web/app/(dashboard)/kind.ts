import { redirect } from 'next/navigation';
import { getSession } from '@foodgrid/auth/next';

export type SellerKind = 'SUPPLIER' | 'WHOLESALER' | 'RETAILER';
const KINDS: SellerKind[] = ['SUPPLIER', 'WHOLESALER', 'RETAILER'];

/** The signed-in product seller's type; anyone else goes back to the login page. */
export async function sellerKind(): Promise<SellerKind> {
  const session = await getSession();
  const kind = session?.claims.tenantType as SellerKind | undefined;
  if (!kind || !KINDS.includes(kind)) redirect('/login');
  return kind;
}

/** Pages that exist for some seller types only (the services refuse the others). */
export async function requireKind(...allowed: SellerKind[]): Promise<SellerKind> {
  const kind = await sellerKind();
  if (!allowed.includes(kind)) redirect('/');
  return kind;
}
