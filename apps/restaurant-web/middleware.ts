import { createAuthMiddleware } from '@foodgrid/auth/next/middleware';

export default createAuthMiddleware({
  publicPaths: [],
  allow: (c) => c.tenantType === 'RESTAURANT',
});

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
