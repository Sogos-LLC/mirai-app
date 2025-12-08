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
            staleTime: 30 * 1000, // 30 seconds - balance between freshness and performance
            gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
            refetchOnWindowFocus: true, // Refetch when user returns to tab
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
