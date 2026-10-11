import type { Metadata } from 'next';
import { AuthScreen } from '@foodgrid/ui';
import { RiderApplication } from '@foodgrid/ui/rider';

export const metadata: Metadata = { title: 'Apply to deliver' };

export default function ApplyPage() {
  return (
    <AuthScreen>
      <RiderApplication />
    </AuthScreen>
  );
}
