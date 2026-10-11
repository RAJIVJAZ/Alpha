import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
// any account may sign in: the middleware sends one without an approved business to /apply
export const { GET, POST } = createAuthRoutes();
