import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
// any account may sign in: one without the RIDER role is sent to /apply by the middleware
export const { GET, POST } = createAuthRoutes();
