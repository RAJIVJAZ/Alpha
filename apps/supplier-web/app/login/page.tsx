import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen, LoginPanel } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Sign in' };
// the Google client id is runtime configuration, so this page renders per request
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <AuthScreen>
      <Suspense>
        <LoginPanel
          title="FoodGrid for Product Sellers"
          description="Suppliers, distributors, manufacturers, wholesalers and retailers sign in here. New to FoodGrid? Sign in with your mobile number or Google account to register your business."
          modes={['password', 'otp']}
          googleClientId={process.env.GOOGLE_WEB_CLIENT_ID || undefined}
        />
      </Suspense>
    </AuthScreen>
  );
}
