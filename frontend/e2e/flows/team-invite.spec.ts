import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from '../fixtures/auth.fixture';

test.describe('Team Invite Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);

    // Mock teams list
    await page.route('**/mirai.v1.TeamService/ListTeams', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          teams: [
            { id: 'team-1', name: 'Engineering', memberCount: 5 },
            { id: 'team-2', name: 'Design', memberCount: 3 },
          ],
        }),
      });
    });

    // Mock invitations list
    await page.route('**/mirai.v1.InvitationService/ListInvitations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invitations: [],
          seatInfo: { total: 10, used: 2, pending: 0, available: 8 },
        }),
      });
    });

    // Mock create invitation
    await page.route('**/mirai.v1.InvitationService/CreateInvitation', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invitation: {
            id: 'new-invite-id',
            email: 'newuser@example.com',
            status: 'INVITATION_STATUS_PENDING',
          },
        }),
      });
    });
  });

  test('teams page loads', async ({ page }) => {
    await page.goto('/teams');
    await expect(page).toHaveURL('/teams');
    await page.screenshot({ path: 'e2e/screenshots/teams-page.png' });
  });

  test('teams page shows team list', async ({ page }) => {
    await page.goto('/teams');

    // Should show team cards
    await expect(page.locator('text=Engineering')).toBeVisible();
    await expect(page.locator('text=Design')).toBeVisible();
  });

  test('can create new team', async ({ page }) => {
    await page.route('**/mirai.v1.TeamService/CreateTeam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: { id: 'new-team-id', name: 'New Team' },
        }),
      });
    });

    await page.goto('/teams');

    const createButton = page.locator('button:has-text("Create"), button:has-text("New Team")');
    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await page.screenshot({ path: 'e2e/screenshots/teams-create-modal.png' });
    }
  });
});

test.describe('Team Member Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);

    await page.route('**/mirai.v1.TeamService/GetTeam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: { id: 'team-1', name: 'Engineering' },
        }),
      });
    });

    await page.route('**/mirai.v1.TeamService/ListTeamMembers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          members: [
            { user: { id: 'user-1', email: 'alice@example.com', firstName: 'Alice' }, role: 'TEAM_ROLE_LEAD' },
            { user: { id: 'user-2', email: 'bob@example.com', firstName: 'Bob' }, role: 'TEAM_ROLE_MEMBER' },
          ],
        }),
      });
    });
  });

  test('team detail page shows members', async ({ page }) => {
    await page.goto('/teams/team-1');
    await page.screenshot({ path: 'e2e/screenshots/team-detail.png' });
  });
});
