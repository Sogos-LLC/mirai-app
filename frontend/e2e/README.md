# End-to-End Testing with Playwright

This directory contains Playwright end-to-end tests for the Mirai platform. Tests can run against either the k3d local development cluster or a deployed environment.

## Test Organization

```
e2e/
├── smoke/              # Quick smoke tests for critical pages
├── flows/              # Full user flow tests (auth, settings, etc.)
├── fixtures/           # Shared test data and utilities
│   └── local-urls.ts   # k3d cluster URL configuration
├── local-dev.spec.ts   # k3d cluster integration tests
└── README.md           # This file
```

## Prerequisites

### For k3d Local Testing (Default)

1. **k3d cluster running**
   ```bash
   # From mirai/k8s-local/
   k3d cluster create mirai-local --config k3d-config.yaml
   ```

2. **HAProxy running with TLS termination**
   ```bash
   # From mirai/local-dev/
   docker-compose up -d haproxy
   ```

3. **/etc/hosts configuration**
   ```bash
   # Add these entries to /etc/hosts
   127.0.0.1 mirai.local
   127.0.0.1 get-mirai.local
   127.0.0.1 api.mirai.local
   127.0.0.1 auth.mirai.local
   ```

4. **mkcert certificates trusted**
   ```bash
   # Install mkcert if not already installed
   brew install mkcert

   # Install local CA
   mkcert -install

   # Verify certificates in local-dev/certs/
   ```

5. **Playwright installed**
   ```bash
   cd frontend
   npm install
   npx playwright install
   ```

### For Local Dev Server Testing

Set the `USE_LOCAL_SERVER=true` environment variable to test against `npm run dev` instead of the k3d cluster.

## Running Tests

### Quick Start - k3d Cluster Tests

```bash
# From frontend/
npm run test:e2e:local              # Run k3d integration tests (headless)
npm run test:e2e:local:headed       # Run with visible browser
npm run test:e2e:local:ui           # Run with Playwright UI
```

### All Tests Against k3d Cluster

```bash
# Run all tests (smoke, flows, local-dev)
npm run test:e2e

# Run specific test suites
npm run test:e2e:smoke              # Just smoke tests
npm run test:e2e:flows              # Just flow tests
```

### Tests Against Local Dev Server

```bash
# Start dev server and run tests against it
USE_LOCAL_SERVER=true npm run test:e2e

# Or set BASE_URL to localhost
BASE_URL=http://localhost:3000 npm run test:e2e
```

### Tests Against Production/Staging

```bash
# Override URLs via environment variables
BASE_URL=https://app.mirai.example.com npm run test:e2e
```

## Environment Variables

Override default configuration with these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://mirai.local` | Frontend base URL |
| `FRONTEND_URL` | `https://mirai.local` | Frontend URL (used in fixtures) |
| `MARKETING_URL` | `https://get-mirai.local` | Marketing site URL |
| `API_URL` | `https://api.mirai.local` | Backend API URL |
| `AUTH_URL` | `https://auth.mirai.local` | Ory Kratos URL |
| `USE_LOCAL_SERVER` | `false` | Start Next.js dev server instead of using k3d |

### Examples

```bash
# Test against staging environment
BASE_URL=https://staging.mirai.com \
API_URL=https://api.staging.mirai.com \
AUTH_URL=https://auth.staging.mirai.com \
npm run test:e2e

# Test against local dev server
USE_LOCAL_SERVER=true npm run test:e2e

# Test specific file with custom URL
BASE_URL=https://app.example.com playwright test e2e/smoke/pages.spec.ts
```

## Test Types

### Smoke Tests (`e2e/smoke/`)

Fast tests that verify critical pages load without errors:
- Landing page
- Pricing page
- Login/registration pages
- Help page
- 404 handling

**Run:** `npm run test:e2e:smoke`

### Flow Tests (`e2e/flows/`)

Complete user journey tests:
- Registration flow
- Sign-in flow
- Settings updates
- Team invitations
- Content library operations

**Run:** `npm run test:e2e:flows`

### Local Development Tests (`e2e/local-dev.spec.ts`)

k3d cluster integration tests:
- Service availability (frontend, marketing, API, Kratos)
- HTTPS/TLS configuration
- Auth flow rendering
- Cross-service communication
- HAProxy routing

**Run:** `npm run test:e2e:local`

## Writing Tests

### Import Fixtures

```typescript
import { LOCAL_URLS, HEALTH_ENDPOINTS } from './fixtures/local-urls';

test('example test', async ({ page }) => {
  await page.goto(LOCAL_URLS.frontend);
  // Test uses environment-aware URL
});
```

### Use Generated Types

Follow the project's proto-first architecture:

```typescript
// Use proto-generated types and enums
import { BlockType } from '@/gen/mirai/v1/course_pb';
import { AIProvider } from '@/gen/mirai/v1/ai_pb';
```

### Mock External Services

```typescript
test('mock API response', async ({ page }) => {
  await page.route('**/mirai.v1.UserService/GetMe', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
      }),
    });
  });

  await page.goto('/dashboard');
});
```

## Debugging

### View Test Report

```bash
npx playwright show-report
```

### Run with UI Mode

```bash
npm run test:e2e:ui
# Or for local-dev tests
npm run test:e2e:local:ui
```

### Run with Headed Browser

```bash
npm run test:e2e:headed
# Or for local-dev tests
npm run test:e2e:local:headed
```

### Debug Specific Test

```bash
npx playwright test --debug e2e/flows/sign-in.spec.ts
```

### View Screenshots and Videos

Failed tests automatically capture:
- Screenshots: `e2e/test-results/*/test-failed-*.png`
- Videos: `e2e/test-results/*/video.webm`
- Traces: `e2e/test-results/*/trace.zip`

Open traces with:
```bash
npx playwright show-trace e2e/test-results/*/trace.zip
```

## Troubleshooting

### Tests Timeout Connecting to k3d

**Problem:** Tests fail with timeout errors when accessing `https://mirai.local`

**Solutions:**
1. Verify k3d cluster is running: `k3d cluster list`
2. Check HAProxy is running: `docker ps | grep haproxy`
3. Verify /etc/hosts entries: `cat /etc/hosts | grep mirai`
4. Test manually: `curl -k https://mirai.local`

### SSL Certificate Errors

**Problem:** Tests fail with `SSL_ERROR_*` or certificate errors

**Solutions:**
1. Install mkcert CA: `mkcert -install`
2. Verify certificates exist: `ls local-dev/certs/`
3. Configuration already sets `ignoreHTTPSErrors: true` for mkcert certs

### 404 on API Health Check

**Problem:** `/health` endpoint returns 404

**Solutions:**
1. Check backend pod is running: `kubectl get pods -n mirai`
2. Verify backend has health endpoint implemented
3. Check HAProxy routing: `docker logs mirai-haproxy`

### Kratos Auth Pages Not Loading

**Problem:** Auth flows time out or redirect infinitely

**Solutions:**
1. Check Kratos pod: `kubectl get pods -n mirai | grep kratos`
2. Verify Kratos config: `kubectl get configmap -n mirai`
3. Check browser network tab for redirect loops
4. Verify session cookies are being set

### Tests Pass Locally But Fail in CI

**Problem:** Tests work on laptop but fail in GitHub Actions

**Solutions:**
1. Set `CI=true` to enable retries and different worker config
2. Ensure CI environment has proper network access
3. Check for timing issues (increase timeouts in CI)
4. Verify environment variables are set in CI config

## CI/CD Integration

Tests automatically run in GitHub Actions on:
- Pull requests
- Main branch pushes

Configuration in `.github/workflows/e2e-tests.yml`

**CI Environment Variables:**
- `CI=true` (auto-set by GitHub Actions)
- Sets retry count to 2
- Uses single worker for stability

## Best Practices

1. **Use fixtures for URLs** - Never hardcode URLs, use `LOCAL_URLS` from fixtures
2. **Wait for load states** - Use `waitForLoadState('networkidle')` for SPA navigation
3. **Test user flows, not implementation** - Focus on user actions, not internal state
4. **Keep tests independent** - Each test should work in isolation
5. **Use descriptive test names** - Test name should explain what's being verified
6. **Mock external APIs** - Don't depend on external services (e.g., Gemini API)
7. **Clean up test data** - Reset state between tests when needed
8. **Use proto types** - Import from `/gen/` for type safety

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Project CLAUDE.md](/Users/john/homelab-cluster/apps/mirai/CLAUDE.md) - Architecture guide
- [k3d Documentation](https://k3d.io)
