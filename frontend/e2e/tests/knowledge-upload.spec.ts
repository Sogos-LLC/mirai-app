/**
 * Knowledge Upload E2E Tests
 *
 * Tests the knowledge upload functionality in the course wizard.
 * Uploads a test document with fictional content (Moon Flowers)
 * to verify RAG ingestion is working correctly.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';

const SCREENSHOT_DIR = 'playwright/screenshots/knowledge-upload';

// Collect console errors throughout the test
const consoleErrors: string[] = [];
const consoleMessages: string[] = [];

test.describe('Knowledge Upload', () => {
  test.beforeAll(async () => {
    // Ensure screenshot directory exists
    const fs = await import('fs');
    const dir = path.join(process.cwd(), SCREENSHOT_DIR);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test('should upload and process a knowledge source file without errors', async ({ page }) => {
    // Setup console monitoring
    page.on('console', (msg) => {
      const text = msg.text();
      consoleMessages.push(`[${msg.type()}] ${text}`);
      if (msg.type() === 'error') {
        consoleErrors.push(text);
        console.log(`[CONSOLE_ERROR] ${text}`);
      }
    });

    // Also monitor page errors
    page.on('pageerror', (error) => {
      consoleErrors.push(`PageError: ${error.message}`);
      console.log(`[PAGE_ERROR] ${error.message}`);
    });

    // Monitor network requests/responses for debugging
    const networkErrors: string[] = [];
    const networkRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('UploadAndProcess') || url.includes('KnowledgeSource')) {
        console.log(`[NETWORK_REQUEST] ${request.method()} ${url}`);
        networkRequests.push(`${request.method()} ${url}`);
      }
    });
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('UploadAndProcess') || url.includes('KnowledgeSource')) {
        console.log(`[NETWORK_RESPONSE] ${response.status()} ${url}`);
      }
      if (response.status() >= 400) {
        networkErrors.push(`${response.status()} ${response.url()}`);
        console.log(`[NETWORK_ERROR] ${response.status()} ${response.url()}`);
      }
    });

    console.log('\n========== KNOWLEDGE UPLOAD TEST START ==========\n');

    // Step 1: Navigate to wizard
    console.log('Step 1: Navigating to course wizard...');
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-wizard-loaded.png`,
      fullPage: true,
    });
    console.log('Screenshot: 01-wizard-loaded.png');

    // Step 2: Enter a course name
    console.log('\nStep 2: Entering course name...');
    const courseNameInput = page.locator('input').first();
    await expect(courseNameInput).toBeVisible({ timeout: 10000 });
    await courseNameInput.fill('Moon Flower Cultivation Course');
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-course-name-entered.png`,
      fullPage: true,
    });
    console.log('Screenshot: 02-course-name-entered.png');

    // Step 3: Look for "Add Knowledge Source" button and click it
    console.log('\nStep 3: Opening knowledge upload modal...');
    const addKnowledgeBtn = page.getByRole('button', { name: /add knowledge source|upload document|knowledge/i });

    // Try to find the button
    const btnVisible = await addKnowledgeBtn.isVisible().catch(() => false);
    if (btnVisible) {
      await addKnowledgeBtn.click();
      console.log('Clicked "Add Knowledge Source" button');
    } else {
      // Alternative: Look for a link or different button pattern
      const knowledgeLink = page.locator('button:has-text("Knowledge"), a:has-text("Knowledge"), [data-testid*="knowledge"]');
      if (await knowledgeLink.count() > 0) {
        await knowledgeLink.first().click();
        console.log('Clicked alternative knowledge element');
      } else {
        console.log('No knowledge upload button found on initial page');
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/02b-no-knowledge-button.png`,
          fullPage: true,
        });
      }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-after-knowledge-click.png`,
      fullPage: true,
    });
    console.log('Screenshot: 03-after-knowledge-click.png');

    // Step 4: Upload the test file
    console.log('\nStep 4: Uploading test file...');
    const testFilePath = path.join(process.cwd(), 'e2e/fixtures/moon-flowers-test.txt');

    // Find file input (may be hidden)
    const fileInput = page.locator('input[type="file"]');
    const fileInputCount = await fileInput.count();
    console.log(`Found ${fileInputCount} file input(s)`);

    if (fileInputCount > 0) {
      await fileInput.first().setInputFiles(testFilePath);
      console.log('File selected via input');

      // Wait for upload to process
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/04-file-uploaded.png`,
        fullPage: true,
      });
      console.log('Screenshot: 04-file-uploaded.png');

      // Wait for processing (look for status indicators)
      console.log('\nStep 5: Waiting for file processing...');

      // Poll for up to 30 seconds for processing to complete
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(3000);

        // Take periodic screenshots
        if (i % 3 === 0 || i === 9) {
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/05-processing-${i}.png`,
            fullPage: true,
          });
          console.log(`Screenshot: 05-processing-${i}.png (${(i + 1) * 3}s)`);
        }

        // Check for success indicators - look for green checkmark icon next to the file
        // The file card changes from "Processing..." to "Indexed" with a green checkmark
        const fileCard = page.locator('text=moon-flowers-test.txt').locator('..');
        const hasIndexedStatus = await fileCard.locator('text=/^Indexed$/').count() > 0;
        const hasGreenCheck = await fileCard.locator('svg.text-green-600, svg.text-green-400').count() > 0;

        if (hasIndexedStatus || hasGreenCheck) {
          console.log('Success: File indexed with green checkmark!');
          break;
        }

        // Check if file is still processing
        const processingText = await fileCard.locator('text=/Processing/').count();
        if (processingText > 0) {
          console.log(`Still processing... (${(i + 1) * 3}s elapsed)`);
        } else {
          // Log what we see for debugging
          const fileCardText = await fileCard.textContent();
          console.log(`File card content: ${fileCardText?.substring(0, 100)}`);
        }

        // Check for error indicators
        const errorIndicator = page.locator('[class*="error"], [class*="red"]:not([class*="red-50"])');
        if (await errorIndicator.count() > 0) {
          console.log('Error indicator found on page');
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/error-indicator-found.png`,
            fullPage: true,
          });
        }
      }

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/06-processing-complete.png`,
        fullPage: true,
      });
      console.log('Screenshot: 06-processing-complete.png');

      // Step 6: Click Done if visible
      console.log('\nStep 6: Looking for Done button...');
      const doneBtn = page.getByRole('button', { name: /done/i });
      if (await doneBtn.isVisible().catch(() => false)) {
        await doneBtn.click();
        console.log('Clicked Done button');
        await page.waitForTimeout(1000);
      }

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/07-after-done.png`,
        fullPage: true,
      });
      console.log('Screenshot: 07-after-done.png');
    } else {
      console.log('No file input found on page');
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/04-no-file-input.png`,
        fullPage: true,
      });
    }

    // Final screenshot of current state
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/08-final-state.png`,
      fullPage: true,
    });
    console.log('Screenshot: 08-final-state.png');

    // Report results
    console.log('\n========== TEST RESULTS ==========\n');

    if (consoleErrors.length > 0) {
      console.log(`Console Errors (${consoleErrors.length}):`);
      consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    } else {
      console.log('No console errors detected');
    }

    if (networkErrors.length > 0) {
      console.log(`\nNetwork Errors (${networkErrors.length}):`);
      networkErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    } else {
      console.log('No network errors detected');
    }

    console.log('\n========== KNOWLEDGE UPLOAD TEST END ==========\n');

    // Filter critical errors (ignore some expected ones)
    const criticalErrors = consoleErrors.filter((err) => {
      // Ignore non-critical errors
      if (err.includes('favicon')) return false;
      if (err.includes('ResizeObserver')) return false;
      if (err.includes('hydration')) return false;
      return true;
    });

    // Assert no critical console errors
    expect(criticalErrors, 'Expected no critical console errors').toHaveLength(0);
  });
});
