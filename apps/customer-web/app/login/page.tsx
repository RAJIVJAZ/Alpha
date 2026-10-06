import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen, LoginPanel } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Sign in' };
// the Google client id is runtime configuration, so this page renders per request
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <AuthScreen
      aside={
        <div className="grid gap-2">
          <p className="text-3xl font-semibold">Food from restaurants and food carts near you.</p>
          <p className="opacity-90">
            Live tracking, FoodGrid One savings and meal plans from neighbourhood kitchens.
          </p>
        </div>
      }
    >
      <Suspense>
        <LoginPanel
          title="Sign in to FoodGrid"
          description="Use your mobile number to continue."
          modes={['otp']}
          googleClientId={process.env.GOOGLE_WEB_CLIENT_ID || undefined}
        />
      </Suspense>
    </AuthScreen>
  );
}
