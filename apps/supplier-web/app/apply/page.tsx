import type { Metadata } from 'next';
import { AuthScreen } from '@foodgrid/ui';
import { BusinessApplication } from '@foodgrid/ui/business';

export const metadata: Metadata = { title: 'Register as a supplier' };

export default function ApplyPage() {
  return (
    <AuthScreen>
      <BusinessApplication types={['SUPPLIER']} />
    </AuthScreen>
  );
}
