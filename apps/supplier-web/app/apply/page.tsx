import type { Metadata } from 'next';
import { AuthScreen } from '@foodgrid/ui';
import { BusinessApplication } from '@foodgrid/ui/business';

export const metadata: Metadata = { title: 'Register as a product seller' };

export default function ApplyPage() {
  return (
    <AuthScreen>
      <BusinessApplication types={['SUPPLIER', 'WHOLESALER', 'RETAILER']} />
    </AuthScreen>
  );
}
