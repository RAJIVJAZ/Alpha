'use client';

import * as React from 'react';
import { keepPreviousData, QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import type { SessionUser } from '@foodgrid/types';
import { api, ApiError, apiFetch, type ApiRequest } from './api';

type Query = ApiRequest['query'];

/** GET with caching; keeps showing the previous data while refetching. */
export function useApi<T>(path: string | null, query?: Query, options: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'> = {}) {
  return useQuery<T, Error>({
    queryKey: [path, query ?? {}],
    queryFn: ({ signal }) => apiFetch<T>(path!, { query, signal }),
    enabled: !!path && options.enabled !== false,
    placeholderData: keepPreviousData,
    ...options,
  });
}

/**
 * Mutation that toasts errors (and optionally success) and invalidates every
 * cached query whose path starts with one of `invalidate`.
 */
export function useApiMutation<TVars = void, TResult = unknown>(
  run: (vars: TVars) => Promise<TResult>,
  opts: { invalidate?: string[]; success?: string | ((r: TResult) => string); onSuccess?: (r: TResult, vars: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: run,
    onSuccess: async (result, vars) => {
      if (opts.invalidate?.length) {
        await qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && opts.invalidate!.some((p) => (q.queryKey[0] as string).startsWith(p)) });
      }
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result, vars);
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      return res.ok ? ((await res.json()) as SessionUser) : null;
    },
    staleTime: 5 * 60_000,
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="top-right" closeButton />
    </QueryClientProvider>
  );
}

export { api, toast };
