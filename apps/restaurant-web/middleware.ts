import { approvedBusiness, createAuthMiddleware } from '@foodgrid/auth/next/middleware';

// the Food Seller Portal: restaurants (incl. cafés and cloud kitchens) and food carts
export default createAuthMiddleware({
  publicPaths: [],
  allow: approvedBusiness('RESTAURANT', 'FOOD_CART'),
});

export const config = {
  // Vercel services do not run Edge functions, so the middleware runs on Node.js
  runtime: 'nodejs',
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
