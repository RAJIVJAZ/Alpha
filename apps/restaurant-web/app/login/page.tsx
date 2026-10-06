import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen, LoginPanel } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthScreen>
      <Suspense>
        <LoginPanel
          title="FoodGrid for Restaurants"
          description="Sign in to manage your restaurant."
          modes={['password', 'otp']}
        />
      </Suspense>
    </AuthScreen>
  );
}
