import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen, LoginPanel } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthScreen>
      <Suspense>
        <LoginPanel
          title="FoodGrid Rider"
          description="Sign in with the mobile number you registered with."
          modes={['otp']}
        />
      </Suspense>
    </AuthScreen>
  );
}
