import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchView } from '@foodgrid/ui/customer';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage() {
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
