import type { Metadata } from 'next';
import { AuthScreen } from '@foodgrid/ui';
import { BusinessApplication } from '@foodgrid/ui/business';

export const metadata: Metadata = { title: 'Register your restaurant or food cart' };

export default function ApplyPage() {
  return (
    <AuthScreen>
      <BusinessApplication types={['RESTAURANT', 'FOOD_CART']} />
    </AuthScreen>
  );
}
