import { createAuthMiddleware } from '@foodgrid/auth/next/middleware';

export default createAuthMiddleware({
  publicPaths: [],
  allow: (c) =>
    Array.isArray(c.roles) &&
    (c.roles as string[]).some((r) => ['ADMIN', 'SUPPORT', 'FINANCE', 'OPS'].includes(r)),
});

export const config = {
  // Vercel services do not run Edge functions, so the middleware runs on Node.js
  runtime: 'nodejs',
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
