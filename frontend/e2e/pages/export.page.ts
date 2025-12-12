import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';
import { TIMEOUTS, PATHS } from '../config';

/**
 * Page Object for SCORM Export functionality.
 * Handles export modal interactions, notification verification, and download.
 */
export class ExportPage {
  private screenshotCount = 0;

  constructor(private page: Page) {}

  /** Navigate to course editor */
  async gotoEditor(courseId: string): Promise<void> {
    await this.page.goto(PATHS.courseEditor(courseId), { waitUntil: 'domcontentloaded' });
    await this.waitForEditorLoad();
  }

  /** Wait for the editor to fully load */
  async waitForEditorLoad(): Promise<void> {
    const loadingSpinner = this.page.getByText('Loading course...');
    try {
      await loadingSpinner.waitFor({ state: 'visible', timeout: 2000 });
      await loadingSpinner.waitFor({ state: 'hidden', timeout: TIMEOUTS.backgroundJob });
    } catch {
      // Spinner wasn't visible, content may already be loaded
    }

    await expect(
      this.page.getByRole('heading', { name: 'Course Outline' })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    await this.page.waitForTimeout(TIMEOUTS.uiTransition);
  }

  // ===== Export Modal Interactions =====

  /** Click the Export button in the editor header */
  async clickExportButton(): Promise<void> {
    const exportButton = this.page.getByRole('button', { name: /Export/i });
    await expect(exportButton).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await exportButton.click();
    console.log('Clicked Export button');
    await this.screenshot('export-button-clicked', 'Clicked export button');
  }

  /** Check if export modal is open */
  async isModalOpen(): Promise<boolean> {
    const modalTitle = this.page.getByRole('heading', { name: /Export Course|Export Complete|Export Failed/i });
    return modalTitle.isVisible();
  }

  /** Wait for export modal to open */
  async waitForModal(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: /Export Course|Export Complete|Export Failed/i })
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    console.log('Export modal is open');
    await this.screenshot('modal-open', 'Export modal opened');
  }

  /** Click Export SCORM button to start export */
  async startExport(): Promise<void> {
    const exportScormButton = this.page.getByRole('button', { name: /Export SCORM/i });
    await expect(exportScormButton).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(exportScormButton).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    console.log('Clicking Export SCORM button...');
    await exportScormButton.click();
    await this.screenshot('export-started', 'Export started');
  }

  /** Wait for export to complete (processing → completed state) */
  async waitForExportComplete(): Promise<{
    success: boolean;
    error?: string;
  }> {
    console.log('Waiting for export to complete...');
    const startTime = Date.now();
    const maxWaitMs = TIMEOUTS.backgroundJob;

    while (Date.now() - startTime < maxWaitMs) {
      // Check for completed state
      const completedHeading = this.page.getByRole('heading', { name: /Export Complete/i });
      if (await completedHeading.isVisible().catch(() => false)) {
        console.log('Export completed successfully!');
        await this.screenshot('export-complete', 'Export completed');
        return { success: true };
      }

      // Check for failed state
      const failedHeading = this.page.getByRole('heading', { name: /Export Failed/i });
      if (await failedHeading.isVisible().catch(() => false)) {
        const errorText = await this.page.locator('.text-secondary').textContent();
        console.log('Export failed:', errorText);
        await this.screenshot('export-failed', 'Export failed');
        return { success: false, error: errorText || 'Export failed' };
      }

      // Check for progress bar (processing state)
      const progressBar = this.page.locator('.bg-purple-600.h-2.rounded-full');
      if (await progressBar.isVisible().catch(() => false)) {
        const width = await progressBar.getAttribute('style');
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (elapsed % 5 === 0) {
          console.log(`Export in progress... ${elapsed}s elapsed, style: ${width}`);
        }
      }

      await this.page.waitForTimeout(1000);
    }

    await this.screenshot('export-timeout', 'Export timeout');
    return { success: false, error: 'Timeout waiting for export to complete' };
  }

  /** Click download button after export completes */
  async clickDownload(): Promise<void> {
    const downloadButton = this.page.getByRole('button', { name: /Download SCORM/i });
    await expect(downloadButton).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(downloadButton).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    console.log('Clicking Download SCORM button...');

    // Set up download promise before clicking
    const downloadPromise = this.page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
    await downloadButton.click();

    // Wait for popup (download opens in new tab)
    const popup = await downloadPromise;
    if (popup) {
      console.log('Download opened in new tab:', popup.url());
      await popup.close();
    }

    await this.screenshot('download-clicked', 'Download button clicked');
  }

  /** Close the export modal */
  async closeModal(): Promise<void> {
    const closeButton = this.page.getByRole('button', { name: /Close|Cancel|OK/i }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  // ===== Notification Verification =====

  /** Open notification panel */
  async openNotificationPanel(): Promise<void> {
    // Click on the notification bell
    const bellButton = this.page.locator('button').filter({ has: this.page.locator('svg.lucide-bell') });
    if (await bellButton.isVisible()) {
      await bellButton.click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);
      console.log('Opened notification panel');
      await this.screenshot('notification-panel', 'Notification panel opened');
    }
  }

  /** Check if export notification appears */
  async verifyExportNotification(): Promise<boolean> {
    await this.openNotificationPanel();

    // Look for export-related notification
    const exportNotification = this.page.locator('text=/Export|SCORM/i').first();
    const isVisible = await exportNotification.isVisible({ timeout: TIMEOUTS.elementVisible }).catch(() => false);

    if (isVisible) {
      console.log('Export notification found in panel');
      await this.screenshot('export-notification', 'Export notification visible');
    } else {
      console.log('Export notification not found');
    }

    return isVisible;
  }

  // ===== Mailpit Verification =====

  /** Check mailpit for export notification email */
  async verifyEmailInMailpit(mailpitUrl: string = 'http://localhost:8025'): Promise<{
    found: boolean;
    subject?: string;
    downloadUrl?: string;
  }> {
    try {
      // Query mailpit API for messages
      const response = await this.page.request.get(`${mailpitUrl}/api/v1/messages`);
      if (!response.ok()) {
        console.log('Mailpit API not available');
        return { found: false };
      }

      const data = await response.json();
      const messages = data.messages || [];

      // Find export-related email
      const exportEmail = messages.find((msg: { Subject?: string }) =>
        msg.Subject?.toLowerCase().includes('export') ||
        msg.Subject?.toLowerCase().includes('scorm')
      );

      if (exportEmail) {
        console.log('Found export email:', exportEmail.Subject);

        // Get message details to find download URL
        const detailResponse = await this.page.request.get(`${mailpitUrl}/api/v1/message/${exportEmail.ID}`);
        if (detailResponse.ok()) {
          const detail = await detailResponse.json();
          const body = detail.Text || detail.HTML || '';

          // Extract download URL from body
          const urlMatch = body.match(/https?:\/\/[^\s"'<>]+download[^\s"'<>]*/i);

          return {
            found: true,
            subject: exportEmail.Subject,
            downloadUrl: urlMatch?.[0],
          };
        }

        return { found: true, subject: exportEmail.Subject };
      }

      console.log('No export email found in mailpit');
      return { found: false };
    } catch (error) {
      console.log('Error checking mailpit:', error);
      return { found: false };
    }
  }

  // ===== Full Export Flow =====

  /** Complete export flow: click export, wait for complete, download */
  async completeExportFlow(): Promise<{
    success: boolean;
    error?: string;
  }> {
    await this.clickExportButton();
    await this.waitForModal();
    await this.startExport();

    const result = await this.waitForExportComplete();

    if (result.success) {
      await this.clickDownload();
    }

    await this.closeModal();
    return result;
  }

  // ===== Utilities =====

  /** Take a screenshot with auto-incrementing prefix */
  async screenshot(name: string, description?: string): Promise<void> {
    this.screenshotCount++;
    const prefix = String(this.screenshotCount).padStart(2, '0');
    await takeScreenshot(this.page, `export-${prefix}-${name}`, description);
  }

  /** Get current page URL */
  getUrl(): string {
    return this.page.url();
  }
}
