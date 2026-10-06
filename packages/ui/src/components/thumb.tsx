'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/** Product or dish photo that falls back to a neutral tile when the image can't load. */
export function Thumb({ src, className }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed)
    return <span className={cn('block shrink-0 rounded-md bg-muted', className)} aria-hidden />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-md border object-cover', className)}
    />
  );
}
