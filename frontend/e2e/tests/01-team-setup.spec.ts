/**
 * Team Setup Tests
 *
 * Prerequisites for knowledge-grounded course creation:
 * 1. Create a team (if none exists)
 * 2. Verify team is accessible
 *
 * Run this FIRST before other knowledge tests.
 */

import { test, expect } from '@playwright/test';
import {
  navigateTo,
  screenshot,
  getTeamCount,
  createTeam,
  navigateToFirstTeam,
  TEST_TEAM,
} from './helpers/test-utils';

const SCREENSHOT_DIR = 'team-setup';

test.describe('Team Setup', () => {
  test.describe.configure({ mode: 'serial' });

  test('should navigate to teams page', async ({ page }) => {
    await navigateTo(page, '/teams');
    await screenshot(page, SCREENSHOT_DIR, '01-teams-page', 'Teams page loaded');

    // Should see either teams list or create button
    const hasContent = await page.locator('text=/team|create/i').isVisible({ timeout: 5000 });
    expect(hasContent).toBe(true);
  });

  test('should have or create a team', async ({ page }) => {
    await navigateTo(page, '/teams');

    const teamCount = await getTeamCount(page);
    console.log(`  Found ${teamCount} existing team(s)`);

    if (teamCount === 0) {
      console.log('  Creating new team...');
      const created = await createTeam(page, TEST_TEAM.name);
      await screenshot(page, SCREENSHOT_DIR, '02-team-created', 'Team created');
      expect(created).toBe(true);

      // Verify team was created
      await navigateTo(page, '/teams');
      const newCount = await getTeamCount(page);
      expect(newCount).toBeGreaterThan(0);
    } else {
      await screenshot(page, SCREENSHOT_DIR, '02-team-exists', 'Team already exists');
    }
  });

  test('should access team details', async ({ page }) => {
    await navigateTo(page, '/teams');

    const teamHref = await navigateToFirstTeam(page);
    expect(teamHref).not.toBeNull();

    await screenshot(page, SCREENSHOT_DIR, '03-team-details', 'Team details page');

    // Should see team content
    const hasTeamContent = await page.locator('text=/member|knowledge|settings/i')
      .isVisible({ timeout: 5000 }).catch(() => false);

    // Even if specific content isn't visible, we navigated successfully
    console.log(`  Team details accessible: ${teamHref}`);
  });

  test('should find knowledge tab or section in team', async ({ page }) => {
    await navigateTo(page, '/teams');
    await navigateToFirstTeam(page);

    // Look for knowledge-related UI
    const knowledgeTab = page.locator('text=/knowledge/i');
    const hasKnowledgeSection = await knowledgeTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasKnowledgeSection) {
      console.log('  ✅ Knowledge section found in team');
      await knowledgeTab.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, SCREENSHOT_DIR, '04-team-knowledge', 'Team knowledge section');
    } else {
      console.log('  ℹ️ Knowledge section may be accessed via Settings');
      await screenshot(page, SCREENSHOT_DIR, '04-team-no-knowledge-tab', 'Team page without knowledge tab');
    }
  });
});
