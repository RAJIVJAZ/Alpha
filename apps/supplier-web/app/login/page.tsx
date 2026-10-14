import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthScreen, LoginPanel } from '@foodgrid/ui';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthScreen>
      <Suspense>
        <LoginPanel
          title="FoodGrid for Product Sellers"
          description="Suppliers, distributors, manufacturers, wholesalers and retailers sign in here. New to FoodGrid? Sign in with your mobile number to register your business."
          modes={['password', 'otp']}
        />
      </Suspense>
    </AuthScreen>
  );
}
