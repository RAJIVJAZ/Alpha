import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST } = createAuthRoutes({
  authorize: (c) =>
    c.roles.includes('RIDER') ? true : 'This number is not registered as a FoodGrid rider.',
});
