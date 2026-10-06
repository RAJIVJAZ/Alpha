import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST } = createAuthRoutes({
  authorize: (c) =>
    c.roles.some((r) => ['ADMIN', 'SUPPORT', 'FINANCE', 'OPS'].includes(r))
      ? true
      : 'This console is for FoodGrid staff.',
});
