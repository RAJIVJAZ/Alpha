import { redirect } from 'next/navigation';
import { getSession } from '@foodgrid/auth/next';
import type { FoodBusinessKind } from '@foodgrid/ui/merchant';

const KINDS: FoodBusinessKind[] = ['RESTAURANT', 'FOOD_CART'];

/** The signed-in food business's type; anyone else goes back to the login page. */
export async function foodKind(): Promise<FoodBusinessKind> {
  const session = await getSession();
  const kind = session?.claims.tenantType as FoodBusinessKind | undefined;
  if (!kind || !KINDS.includes(kind)) redirect('/login');
  return kind;
}

/** Pages that exist for some business types only. */
export async function requireKind(...allowed: FoodBusinessKind[]): Promise<FoodBusinessKind> {
  const kind = await foodKind();
  if (!allowed.includes(kind)) redirect('/');
  return kind;
}
