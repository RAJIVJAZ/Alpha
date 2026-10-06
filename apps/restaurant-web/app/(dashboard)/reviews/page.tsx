import type { Metadata } from 'next';
import { ReviewsInbox } from '@foodgrid/ui/merchant';

export const metadata: Metadata = { title: 'Reviews' };

export default function Page() {
  return <ReviewsInbox />;
}
