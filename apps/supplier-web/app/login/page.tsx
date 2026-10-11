import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen, LoginPanel } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthScreen>
      <Suspense>
        <LoginPanel
          title="FoodGrid for Suppliers"
          description="Sign in to manage your catalogue and orders. New to FoodGrid? Sign in with your mobile number to register as a supplier."
          modes={['password', 'otp']}
        />
      </Suspense>
    </AuthScreen>
  );
}
