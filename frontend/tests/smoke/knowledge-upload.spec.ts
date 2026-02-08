import { test, expect } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

const TEAM_URL = '/teams/b4063a11-8830-4923-9cc8-74a43eee3d29';
const TEST_FILE = '/Users/john/Desktop/Travel-Guide.md';

test.describe('Knowledge Document Upload', () => {
  test.beforeAll(() => resetScreenshotCounter());

  test('upload markdown file to team knowledge', async ({ page }) => {
    test.setTimeout(180_000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    // Navigate to team page and wait for it to load
    await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await screenshot(page, 'team-page-loaded');

    // Scroll down to knowledge base section
    const knowledgeHeading = page.getByText('Team Knowledge').first();
    await expect(knowledgeHeading).toBeVisible({ timeout: 15_000 });
    await knowledgeHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await screenshot(page, 'knowledge-section');

    // Delete any existing Travel-Guide.md to ensure clean state
    const existingFile = page.getByText('Travel-Guide.md');
    if (await existingFile.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log('Found existing Travel-Guide.md, deleting it first...');
      // Click the delete button (trash icon) next to the file
      const deleteButton = existingFile.locator('..').locator('..').locator('button').last();
      page.once('dialog', (dialog) => dialog.accept());
      await deleteButton.click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'deleted-existing-file');
    }

    // Upload file via the hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_FILE);
    await page.waitForTimeout(2000);
    await screenshot(page, 'file-selected');

    // Handle duplicate detection modal if it appears
    const uploadAnyway = page.getByRole('button', { name: 'Upload Anyway' });
    if (await uploadAnyway.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('Duplicate detected, clicking Upload Anyway');
      await uploadAnyway.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'clicked-upload-anyway');
    }

    // Wait for upload/processing modal to appear (use heading role)
    await expect(
      page.getByRole('heading', { name: 'Processing Document' })
        .or(page.getByRole('heading', { name: 'Upload Complete' }))
        .or(page.getByRole('heading', { name: 'Upload Failed' }))
    ).toBeVisible({ timeout: 30_000 });
    await screenshot(page, 'upload-modal');

    // Wait for processing to finish (success or failure) — long timeout for AI processing
    const successText = page.getByRole('heading', { name: 'Upload Complete' });
    const failedText = page.getByRole('heading', { name: 'Upload Failed' });

    await expect(successText.or(failedText)).toBeVisible({ timeout: 120_000 });
    await screenshot(page, 'upload-result');

    // Check if it succeeded
    const succeeded = await successText.isVisible();
    const failed = await failedText.isVisible();

    if (failed) {
      await screenshot(page, 'upload-failed-details');
      // Get the full modal text for debugging
      const modalText = await page.locator('.shadow-xl').first().textContent().catch(() => 'could not read modal');
      console.log(`UPLOAD FAILED - Modal text: ${modalText}`);
    }

    // Print console logs
    console.log('--- CONSOLE LOGS ---');
    consoleLogs.slice(-30).forEach((log) => console.log(log));
    console.log('--- END CONSOLE LOGS ---');

    // Assert success
    expect(succeeded, 'Document upload should succeed').toBe(true);

    // --- Fix 1: Verify chunking statistics are populated (not 0/—/—) ---
    const modal = page.locator('.shadow-xl').first();

    // Wait for refetch to populate stats (the useEffect triggers refetchSource)
    await page.waitForTimeout(3000);

    // Scroll modal to see the stats section
    const chunksLabel = modal.getByText('Chunks', { exact: true });
    await chunksLabel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Get the stats section — three stat boxes (Chunks, Tokens, Est. Lessons)
    const chunksStat = chunksLabel.locator('..');
    const tokensStat = modal.getByText('Tokens', { exact: true }).locator('..');

    // Chunks should be > 0
    const chunksValue = await chunksStat.locator('p.text-2xl').textContent();
    console.log(`Chunks value: "${chunksValue}"`);
    expect(Number(chunksValue), 'Chunks should be > 0').toBeGreaterThan(0);

    // Tokens should show a number (not —)
    const tokensValue = await tokensStat.locator('p.text-2xl').textContent();
    console.log(`Tokens value: "${tokensValue}"`);
    expect(tokensValue, 'Tokens should not be —').not.toBe('—');
    expect(tokensValue, 'Tokens should not be empty').toBeTruthy();

    await screenshot(page, 'stats-populated');

    // --- Fix 2: Verify markdown content preview renders as rich HTML ---
    // Expand the Content Preview accordion
    const contentPreviewToggle = modal.getByText('Content Preview');
    await contentPreviewToggle.scrollIntoViewIfNeeded();
    await contentPreviewToggle.click();
    await page.waitForTimeout(500);

    // The markdown file should render via dangerouslySetInnerHTML (not <pre>)
    // For .md files, the preview uses a div with overflow-x-auto (not <pre>)
    const previewDiv = modal.locator('div.overflow-x-auto').first();
    await previewDiv.scrollIntoViewIfNeeded();
    const previewHtml = await previewDiv.innerHTML();
    console.log(`Preview HTML (first 300 chars): ${previewHtml.slice(0, 300)}`);

    // For a .md file, content should be rendered as HTML, not raw markdown
    const hasHtmlTags = previewHtml.includes('<strong>') ||
      previewHtml.includes('<em>') ||
      previewHtml.includes('<h1>') ||
      previewHtml.includes('<h2>') ||
      previewHtml.includes('<h3>') ||
      previewHtml.includes('<li>') ||
      previewHtml.includes('<code>');
    expect(hasHtmlTags, 'Markdown should be rendered as HTML, not raw text').toBe(true);

    // Verify no <pre> tag is used for markdown preview (it should use <div>)
    const preElements = await modal.locator('pre').count();
    expect(preElements, 'Markdown preview should not use <pre> tags').toBe(0);

    await screenshot(page, 'markdown-preview-rendered');

    // Click Done to close the modal
    const doneButton = page.getByRole('button', { name: 'Done' });
    if (await doneButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await doneButton.click();
      await page.waitForTimeout(2000);
    }

    await screenshot(page, 'after-close-modal');

    // Verify the file appears in the knowledge list with Ready status
    await expect(page.getByText('Travel-Guide.md').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ready').first()).toBeVisible({ timeout: 10_000 });
    await screenshot(page, 'file-in-knowledge-list');

    console.log('Knowledge upload test passed successfully');
  });
});
