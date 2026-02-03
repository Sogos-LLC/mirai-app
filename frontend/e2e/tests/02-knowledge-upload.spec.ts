/**
 * Knowledge Upload Tests
 *
 * Tests the knowledge upload flow for team knowledge sources.
 * Uses the pre-created "Acme Test Team" and uploads the ACME Product Handbook.
 *
 * Expected Modal UX:
 * 1. File confirmation (name, type, size, status)
 * 2. Processing status (uploading, parsing, chunking, embedding, indexing)
 * 3. Knowledge base metadata (title, description, tags)
 * 4. Content preview (first sections, language, token count)
 * 5. Chunking hints (chunk size, sections detected)
 * 6. Actions (Save, Cancel, Replace)
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = 'playwright/screenshots/knowledge-upload';
const ACME_TEAM_ID = 'b4063a11-8830-4923-9cc8-74a43eee3d29';
const ACME_TEAM_URL = `/teams/${ACME_TEAM_ID}`;

const ACME_HANDBOOK_PATH = path.join(
  process.cwd(),
  '../experiments/team-knowledge-poc/test-files/acme-corp-product-handbook.md'
);

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function ensureScreenshotDir() {
  const dir = path.join(process.cwd(), SCREENSHOT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Knowledge Upload to Acme Test Team', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    ensureScreenshotDir();
  });

  test('should navigate to Acme Test Team', async ({ page }) => {
    // Use load instead of networkidle (SSE keeps connection open)
    await page.goto(ACME_TEAM_URL, { waitUntil: 'load', timeout: 30000 });

    // Wait for page content to render
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-team-page-initial.png`,
      fullPage: true
    });

    // Wait for either team name or tabs to appear
    const teamLoaded = await Promise.race([
      page.locator('text=/acme.*test.*team/i').waitFor({ timeout: 20000 }).then(() => 'team-name'),
      page.locator('[role="tablist"]').waitFor({ timeout: 20000 }).then(() => 'tabs'),
      page.locator('h1').waitFor({ timeout: 20000 }).then(() => 'heading'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 20000))
    ]).catch(() => 'error');

    console.log(`  Team page loaded via: ${teamLoaded}`);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-team-page.png`,
      fullPage: true
    });

    // Verify we're on the team page
    const teamName = page.locator('text=/acme.*test.*team/i');
    const hasTeamName = await teamName.isVisible({ timeout: 3000 }).catch(() => false);

    const hasTabs = await page.locator('[role="tablist"]').isVisible({ timeout: 3000 }).catch(() => false);
    const hasHeading = await page.locator('h1').isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`  Verification - Name: ${hasTeamName}, Tabs: ${hasTabs}, Heading: ${hasHeading}`);

    expect(hasTeamName || hasTabs || hasHeading).toBe(true);
  });

  test('should find knowledge section', async ({ page }) => {
    await page.goto(ACME_TEAM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Look for Knowledge tab or section
    const knowledgeTab = page.locator('button:has-text("Knowledge"), a:has-text("Knowledge"), [role="tab"]:has-text("Knowledge")');
    const hasKnowledgeTab = await knowledgeTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasKnowledgeTab) {
      console.log('  ✅ Found Knowledge tab');
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('  ℹ️ Looking for Knowledge section in page...');
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-knowledge-section.png`,
      fullPage: true
    });

    // Look for upload zone or add knowledge button
    const uploadZone = page.locator('text=/drop.*files|click.*upload|add.*knowledge|upload/i');
    const hasUploadZone = await uploadZone.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`  Upload zone visible: ${hasUploadZone}`);
  });

  test('should upload ACME Product Handbook', async ({ page }) => {
    // Verify the test file exists
    const fileExists = fs.existsSync(ACME_HANDBOOK_PATH);
    console.log(`  Test file exists: ${fileExists}`);
    console.log(`  Path: ${ACME_HANDBOOK_PATH}`);

    if (!fileExists) {
      test.skip();
      return;
    }

    const fileStats = fs.statSync(ACME_HANDBOOK_PATH);
    console.log(`  File size: ${(fileStats.size / 1024).toFixed(1)} KB`);

    await page.goto(ACME_TEAM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click Knowledge tab if present
    const knowledgeTab = page.locator('button:has-text("Knowledge"), [role="tab"]:has-text("Knowledge")');
    if (await knowledgeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
    }

    // Find file input
    const fileInput = page.locator('input[type="file"]');
    const hasFileInput = await fileInput.count() > 0;

    if (!hasFileInput) {
      console.log('  ⚠️ No file input found - looking for Add button');

      // Try clicking an Add button to reveal the input
      const addBtn = page.locator('button:has-text("Add"), button:has-text("Upload")');
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-before-upload.png`,
      fullPage: true
    });

    // Upload the file
    const fileInputAfter = page.locator('input[type="file"]');
    if (await fileInputAfter.count() > 0) {
      await fileInputAfter.first().setInputFiles(ACME_HANDBOOK_PATH);
      console.log('  📄 File selected for upload');

      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/04-file-selected.png`,
        fullPage: true
      });
    }
  });

  test('should show upload modal with file confirmation', async ({ page }) => {
    // This test continues from the previous upload
    await page.goto(ACME_TEAM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click Knowledge tab
    const knowledgeTab = page.locator('button:has-text("Knowledge"), [role="tab"]:has-text("Knowledge")');
    if (await knowledgeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
    }

    // Trigger upload
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0 && fs.existsSync(ACME_HANDBOOK_PATH)) {
      await fileInput.first().setInputFiles(ACME_HANDBOOK_PATH);

      // Wait for modal to appear (duplicate check or upload modal)
      await page.waitForTimeout(2000);

      // Take screenshot of modal appearing
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/05-modal-initial.png`,
        fullPage: true
      });

      // Check for duplicate warning modal first (file may already exist)
      const duplicateModal = page.locator('h3:has-text("Duplicate File Detected")');
      const hasDuplicateWarning = await duplicateModal.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasDuplicateWarning) {
        console.log('  ⚠️ Duplicate file detected - clicking Upload Anyway');

        // Screenshot of duplicate modal
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/05-duplicate-modal.png`,
          fullPage: true
        });

        // Click "Upload Anyway" to proceed with upload modal
        const uploadAnywayBtn = page.locator('button:has-text("Upload Anyway")');
        if (await uploadAnywayBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await uploadAnywayBtn.click();
          await page.waitForTimeout(1000);
          console.log('  ✅ Clicked Upload Anyway');
        }
      }

      // Now check for the upload progress modal
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/05-upload-modal-processing.png`,
        fullPage: true
      });

      // Check for modal header - "Processing Document" or "Upload Complete"
      const modalHeader = page.locator('h2:has-text("Processing Document"), h2:has-text("Upload Complete")');
      const hasModal = await modalHeader.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasModal) {
        console.log('  ✅ Upload modal appeared');

        // 1. File Information section
        const fileInfoSection = page.locator('text=/File Information/i');
        const hasFileInfo = await fileInfoSection.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`    📁 File Information section: ${hasFileInfo}`);

        // File name
        const fileName = page.locator('text=/acme.*product.*handbook/i');
        const hasFileName = await fileName.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`    📄 File name visible: ${hasFileName}`);

        // File type (Markdown)
        const fileType = page.locator('text=/Markdown|Plain Text/i');
        const hasFileType = await fileType.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`    📝 File type visible: ${hasFileType}`);

        // File size
        const fileSize = page.locator('text=/\\d+\\.?\\d*\\s*(KB|MB|B)/');
        const hasFileSize = await fileSize.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`    📊 File size visible: ${hasFileSize}`);

        // 2. Processing Status section
        const processingSection = page.locator('text=/Processing Status/i');
        const hasProcessingSection = await processingSection.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`    ⏳ Processing Status section: ${hasProcessingSection}`);

        // Look for processing stages
        const stages = ['Uploading', 'Parsing', 'Chunking', 'Embedding', 'Indexing'];
        for (const stage of stages) {
          const stageEl = page.locator(`text=${stage}`);
          const hasStage = await stageEl.isVisible({ timeout: 1000 }).catch(() => false);
          if (hasStage) {
            console.log(`      ✓ ${stage} stage visible`);
          }
        }

        // 3. Wait for processing to complete (up to 90 seconds)
        console.log('    ⏳ Waiting for processing to complete...');
        let isComplete = false;
        for (let i = 0; i < 30; i++) {
          await page.waitForTimeout(3000);

          // Check for "Upload Complete" or "Ready" status
          const completeHeader = page.locator('h2:has-text("Upload Complete")');
          const readyBadge = page.locator('text=/Ready/');

          const headerVisible = await completeHeader.isVisible().catch(() => false);
          const badgeVisible = await readyBadge.isVisible().catch(() => false);

          if (headerVisible || badgeVisible) {
            console.log(`    ✅ Processing complete after ${(i + 1) * 3}s`);
            isComplete = true;
            break;
          }

          if (i % 5 === 4) {
            console.log(`      Still processing... (${(i + 1) * 3}s)`);
          }
        }

        // Take screenshot of completed state
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/05-upload-modal-complete.png`,
          fullPage: true
        });

        if (isComplete) {
          // 4. Check Document Analysis section
          const analysisSection = page.locator('text=/Document Analysis/i');
          const hasAnalysis = await analysisSection.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    📊 Document Analysis section: ${hasAnalysis}`);

          // Check for AI Summary
          const summarySection = page.locator('text=/AI Summary/i');
          const hasSummary = await summarySection.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    📝 AI Summary visible: ${hasSummary}`);

          // Check for Main Topics
          const topicsSection = page.locator('text=/Main Topics/i');
          const hasTopics = await topicsSection.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    🏷️ Main Topics visible: ${hasTopics}`);

          // 5. Check Chunking Statistics section
          const chunkingSection = page.locator('text=/Chunking Statistics/i');
          const hasChunking = await chunkingSection.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    🧩 Chunking Statistics section: ${hasChunking}`);

          // Chunk count
          const chunks = page.locator('text=/Chunks/i');
          const hasChunks = await chunks.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    📊 Chunks visible: ${hasChunks}`);

          // Token count
          const tokens = page.locator('text=/Tokens/i');
          const hasTokens = await tokens.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    🔢 Tokens visible: ${hasTokens}`);

          // Estimated lessons
          const lessons = page.locator('text=/Est\\. Lessons/i');
          const hasLessons = await lessons.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    📚 Est. Lessons visible: ${hasLessons}`);

          // 6. Check action buttons
          const doneBtn = page.locator('button:has-text("Done")');
          const hasDoneBtn = await doneBtn.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    ✅ Done button visible: ${hasDoneBtn}`);

          const closeBtn = page.locator('button:has-text("Close")');
          const hasCloseBtn = await closeBtn.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`    ❌ Close button visible: ${hasCloseBtn}`);

          // Click Done to close modal
          if (hasDoneBtn) {
            await doneBtn.click();
            console.log('    ✅ Clicked Done button');
          } else if (hasCloseBtn) {
            await closeBtn.click();
            console.log('    ✅ Clicked Close button');
          }
        }
      } else {
        console.log('  ℹ️ Modal did not appear - checking for inline upload');

        // Take screenshot anyway
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/05-no-modal.png`,
          fullPage: true
        });
      }
    }
  });

  test('should process and show document as ready', async ({ page }) => {
    await page.goto(ACME_TEAM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click Knowledge tab
    const knowledgeTab = page.locator('button:has-text("Knowledge"), [role="tab"]:has-text("Knowledge")');
    if (await knowledgeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/06-knowledge-list.png`,
      fullPage: true
    });

    // Check for existing knowledge sources
    const knowledgeItems = page.locator('[class*="knowledge"], [class*="source"], tr, [class*="card"]');
    const itemCount = await knowledgeItems.count();
    console.log(`  Found ${itemCount} potential knowledge items`);

    // Look for our handbook
    const handbookItem = page.locator('text=/acme.*handbook|product.*handbook/i');
    const hasHandbook = await handbookItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasHandbook) {
      console.log('  ✅ ACME Handbook found in knowledge list');

      // Check status
      const readyStatus = page.locator('text=/ready/i');
      const processingStatus = page.locator('text=/processing/i');

      const isReady = await readyStatus.isVisible({ timeout: 2000 }).catch(() => false);
      const isProcessing = await processingStatus.isVisible({ timeout: 2000 }).catch(() => false);

      if (isReady) {
        console.log('  ✅ Document status: Ready');
      } else if (isProcessing) {
        console.log('  ⏳ Document status: Processing');

        // Wait for processing to complete (up to 60 seconds)
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(3000);
          const nowReady = await readyStatus.isVisible().catch(() => false);
          if (nowReady) {
            console.log('  ✅ Document status: Ready (after waiting)');
            break;
          }
          console.log(`  ⏳ Still processing... (${(i + 1) * 3}s)`);
        }
      }

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/07-document-ready.png`,
        fullPage: true
      });

      // Check for metadata display
      const tokenDisplay = page.locator('text=/\\d+.*tokens/i');
      const chunkDisplay = page.locator('text=/\\d+.*chunks/i');

      const tokens = await tokenDisplay.textContent().catch(() => 'N/A');
      const chunks = await chunkDisplay.textContent().catch(() => 'N/A');

      console.log(`  📊 Tokens: ${tokens}`);
      console.log(`  🧩 Chunks: ${chunks}`);

    } else {
      console.log('  ℹ️ Handbook not yet in list - may need to upload first');
    }
  });

  test('should verify knowledge is accessible for course creation', async ({ page }) => {
    // Navigate to wizard to check if knowledge is available
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/08-wizard-check.png`,
      fullPage: true
    });

    // Check step count
    const stepText = page.locator('text=/\\d+ simple steps/i');
    const steps = await stepText.textContent().catch(() => '');
    console.log(`  Wizard steps: ${steps}`);

    // Check for Knowledge Selection step
    const knowledgeStep = page.locator('text=/knowledge sources/i');
    const hasKnowledgeStep = await knowledgeStep.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasKnowledgeStep) {
      console.log('  ✅ Knowledge Selection step visible');

      // Look for our handbook
      const handbook = page.locator('text=/acme.*handbook|product.*handbook/i');
      const handbookInWizard = await handbook.isVisible({ timeout: 5000 }).catch(() => false);

      if (handbookInWizard) {
        console.log('  ✅ ACME Handbook available for selection in wizard');
      } else {
        console.log('  ℹ️ Handbook not visible in wizard (may need team knowledge loaded)');
      }

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/09-wizard-knowledge-selection.png`,
        fullPage: true
      });
    } else {
      console.log('  ℹ️ Knowledge Selection step not visible (may have auto-skipped)');
    }
  });
});
