import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST } = createAuthRoutes({
  authorize: (c) =>
    c.tenantType === 'SUPPLIER' ? true : 'This account is not linked to a supplier on FoodGrid.',
});
