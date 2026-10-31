import { test, expect } from '@playwright/test';

/**
 * Smoke: login page renders. Full operator flow needs api + modbus-sim running.
 * Run with: pnpm --filter @tele-pendant/web test:e2e
 */
test('login page shows Tele-Pendant brand', async ({ page }) => {
  const health = await page.request.get('http://127.0.0.1:3010/api/v1/health');
  test.skip(!health.ok(), 'API not running on :3010');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tele-Pendant' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
