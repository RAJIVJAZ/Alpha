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
          title="FoodGrid Rider"
          description="Sign in with your mobile number. New to FoodGrid? Sign in and apply to deliver."
          modes={['otp']}
          googleClientId={process.env.GOOGLE_WEB_CLIENT_ID || undefined}
        />
      </Suspense>
    </AuthScreen>
  );
}
