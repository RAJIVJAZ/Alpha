import { approvedBusiness, createAuthMiddleware } from '@foodgrid/auth/next/middleware';

// the Product Seller Portal: suppliers, wholesalers and retailers
export default createAuthMiddleware({
  publicPaths: [],
  allow: approvedBusiness('SUPPLIER', 'WHOLESALER', 'RETAILER'),
});

export const config = {
  // Vercel services do not run Edge functions, so the middleware runs on Node.js
  runtime: 'nodejs',
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
