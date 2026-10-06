import { createAuthMiddleware } from '@foodgrid/auth/next/middleware';

export default createAuthMiddleware({
  publicPaths: ['/', '/search', '/r/*', '/t/*', '/membership', '/cms/*'],
});

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
