import { createAuthRoutes } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST } = createAuthRoutes();
