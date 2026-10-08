import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST } = createAuthRoutes({
  authorize: (c) =>
    c.tenantType === 'SUPPLIER'
      ? true
      : 'This account is not linked to a supplier on FoodGrid. If a business invited you, accept the invitation under Account in the FoodGrid app or at foodgrid.in first.',
});
