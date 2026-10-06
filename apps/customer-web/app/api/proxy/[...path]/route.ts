import { createApiProxy } from '@foodgrid/auth/next';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, PATCH, DELETE } = createApiProxy();
