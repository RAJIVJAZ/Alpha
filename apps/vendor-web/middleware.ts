import { createAuthMiddleware } from '@foodgrid/auth/next/middleware';

export default createAuthMiddleware({
  publicPaths: [],
  allow: (c) => ['FOOD_CART', 'RETAILER', 'WHOLESALER'].includes(String(c.tenantType)),
});

export const config = {
  // Vercel services do not run Edge functions, so the middleware runs on Node.js
  runtime: 'nodejs',
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
