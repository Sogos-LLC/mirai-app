import { createConnectTransport } from '@connectrpc/connect-web';
import { Code, ConnectError } from '@connectrpc/connect';
import type { Interceptor } from '@connectrpc/connect';

// Retry on transient failures (Unavailable, DeadlineExceeded) with exponential backoff.
// Other error codes (auth, not found, validation) are NOT retried.
const retryInterceptor: Interceptor = (next) => async (req) => {
  const maxRetries = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await next(req);
    } catch (err) {
      lastError = err;
      if (
        err instanceof ConnectError &&
        (err.code === Code.Unavailable || err.code === Code.DeadlineExceeded) &&
        attempt < maxRetries
      ) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

// Create a transport that sends requests to the backend API
export const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  // Use JSON format for better compatibility with Cloudflare proxying
  // Binary format can cause 404 errors when passing through certain proxies
  useBinaryFormat: false,
  // 30s deadline - fail fast instead of hanging forever on stale connections
  defaultTimeoutMs: 30_000,
  interceptors: [retryInterceptor],
  // Use custom fetch to include credentials for cookie-based auth
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});
