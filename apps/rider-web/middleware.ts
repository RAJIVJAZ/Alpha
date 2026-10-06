import { createAuthMiddleware } from '@foodgrid/auth/next/middleware';

export default createAuthMiddleware({
  publicPaths: [],
  allow: (c) => Array.isArray(c.roles) && (c.roles as string[]).includes('RIDER'),
});

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
