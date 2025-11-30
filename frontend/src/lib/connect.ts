import { createConnectTransport } from '@connectrpc/connect-web';

// Create a transport that sends requests to the backend API
export const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  // Use custom fetch to include credentials for cookie-based auth
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});
