'use client';

import { TransportProvider } from '@connectrpc/connect-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { transport } from '@/lib/connect';
import { useState } from 'react';

interface ConnectProviderProps {
  children: React.ReactNode;
}

export function ConnectProvider({ children }: ConnectProviderProps) {
  // Create a client with useState to ensure it's created only once per component
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - mutations invalidate queries, so freshness is handled explicitly
            gcTime: 30 * 60 * 1000, // 30 minutes — keeps stale data for instant display while refetching in background
            refetchOnWindowFocus: false, // Disabled globally; SSE streams handle updates
            refetchOnReconnect: true, // Refetch when network reconnects
            retry: 1, // Retry once on failure
          },
        },
      })
  );

  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </TransportProvider>
  );
}
