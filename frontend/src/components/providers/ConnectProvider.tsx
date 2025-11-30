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
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
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
