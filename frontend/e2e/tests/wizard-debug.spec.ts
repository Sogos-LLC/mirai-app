/**
 * Diagnostic test to verify UAT request reliability fixes:
 * - Cloudflare tunnel: reduced keepAlive pool (50→2) + connectTimeout (120s→10s)
 * - Frontend transport: 30s deadline + retry interceptor
 *
 * Tests that CreateCourse responds within 10s (was hanging 125s+).
 * Delete this file once wizard works reliably.
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers/screenshots';
import { TIMEOUTS } from '../config';

test.describe('UAT Request Reliability', () => {
  test('CreateCourse responds within 10s', async ({ page }) => {
    // Navigate to wizard to establish session
    await page.goto('https://mirai-uat.sogos.io/course/wizard', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.pageLoad,
    });
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'debug-reliability-before', 'Wizard page loaded');

    // Use page.evaluate to make a raw fetch call with the same cookies
    const result = await page.evaluate(async () => {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(
          'https://mirai-api-uat.sogos.io/mirai.v1.CourseService/CreateCourse',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Connect-Protocol-Version': '1',
            },
            credentials: 'include',
            body: JSON.stringify({
              settings: { title: 'Reliability Test - ' + new Date().toISOString() },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        const text = await response.text();

        return {
          status: response.status,
          elapsed,
          bodyLength: text.length,
          bodyPreview: text.substring(0, 500),
        };
      } catch (err: unknown) {
        const elapsed = Date.now() - startTime;
        return {
          error: err instanceof Error ? err.message : String(err),
          elapsed,
        };
      }
    });

    console.log('CreateCourse result:', JSON.stringify(result, null, 2));

    // Verify response came back
    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('status', 200);

    // Verify response was fast (< 10s, was 125s+ before fix)
    expect(result.elapsed).toBeLessThan(10000);

    // Verify response body contains a course ID
    expect(result.bodyPreview).toContain('course');

    await takeScreenshot(page, 'debug-reliability-after', `Response in ${result.elapsed}ms`);
  });

  test('wizard progresses past Starting state', async ({ page }) => {
    // Track network for diagnostics
    const responses: Array<{ url: string; status: number; elapsed: number }> = [];
    const pendingRequests = new Map<string, number>();

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('mirai-api-uat')) {
        pendingRequests.set(url, Date.now());
      }
    });

    page.on('response', (res) => {
      const url = res.url();
      const startTime = pendingRequests.get(url);
      if (startTime) {
        const elapsed = Date.now() - startTime;
        pendingRequests.delete(url);
        responses.push({ url: url.split('.io')[1] || url, status: res.status(), elapsed });
        console.log(`[RES] ${res.status()} ${url.split('.io')[1]} (${elapsed}ms)`);
      }
    });

    page.on('requestfailed', (req) => {
      const url = req.url();
      if (url.includes('mirai-api-uat')) {
        console.log(`[FAIL] ${url.split('.io')[1]} - ${req.failure()?.errorText}`);
      }
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });

    // Navigate to wizard
    await page.goto('https://mirai-uat.sogos.io/course/wizard', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.pageLoad,
    });
    await page.waitForTimeout(3000);

    // Fill form and click Generate Title
    const nameInput = page.locator('input#courseName');
    await nameInput.fill('Reliability Test Course');

    const generateBtn = page.getByRole('button', { name: /generate title/i });
    await expect(generateBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });

    console.log('\n=== Clicking Generate Title ===');
    await generateBtn.click();

    // Wait for wizard to progress past "Starting..." (max 30s per SLA)
    let progressedPastStarting = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);

      const hasReview = await page
        .getByRole('heading', { name: /review/i })
        .isVisible()
        .catch(() => false);
      const hasError = await page
        .locator('.text-red-600, .text-red-400')
        .isVisible()
        .catch(() => false);

      if (hasReview) {
        console.log(`SUCCESS: Approval step appeared at t=${(i + 1) * 2}s`);
        progressedPastStarting = true;
        break;
      }

      if (hasError) {
        const errorText = await page.locator('.text-red-600, .text-red-400').textContent();
        console.log(`ERROR: ${errorText}`);
        break;
      }
    }

    await takeScreenshot(page, 'debug-reliability-wizard', 'Wizard final state');

    // Log any still-pending requests
    if (pendingRequests.size > 0) {
      console.log('\n=== STILL PENDING REQUESTS ===');
      for (const [url, startTime] of pendingRequests) {
        console.log(`  HANGING: ${url.split('.io')[1]} (${Date.now() - startTime}ms)`);
      }
    }

    // Log all response times
    console.log('\n=== Response Times ===');
    for (const r of responses) {
      console.log(`  ${r.status} ${r.url} (${r.elapsed}ms)`);
    }

    // All API responses should have been < 30s (transport timeout)
    const slowResponses = responses.filter((r) => r.elapsed > 30000);
    expect(slowResponses).toHaveLength(0);

    // Wizard should have progressed past "Starting..."
    expect(progressedPastStarting).toBe(true);
  });
});
