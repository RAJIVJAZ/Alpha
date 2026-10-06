import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  // trace workspace packages from the monorepo root into the standalone bundle
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@foodgrid/ui', '@foodgrid/auth'],
  // per-page imports from the @foodgrid/ui barrels instead of one bundle for every route
  experimental: {
    optimizePackageImports: [
      '@foodgrid/ui',
      '@foodgrid/ui/merchant',
      '@foodgrid/ui/seller',
      '@foodgrid/ui/charts',
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  // linted by the workspace ESLint config in CI (pnpm lint)
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ];
  },
};

export default config;
