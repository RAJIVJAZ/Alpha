import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST } = createAuthRoutes({
  authorize: (c) =>
    c.tenantType === 'RESTAURANT'
      ? true
      : 'This account is not linked to a restaurant on FoodGrid.',
});
