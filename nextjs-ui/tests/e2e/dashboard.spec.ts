import { test, expect, login } from './fixtures'

test.describe('dashboard', () => {
  test('renders after login (empty state when no rooms)', async ({ page }) => {
    await login(page)
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
    // Either we see the empty-state message or at least one room card.
    const empty = page.getByText(/no rooms yet/i)
    const card = page.locator('article')
    await expect(empty.or(card.first())).toBeVisible()
  })

  test('navbar shows the four dashboard links', async ({ page }) => {
    await login(page)
    // Desktop nav links — visible only on lg breakpoint, but the markup is present.
    for (const label of ['Dashboard', 'Sensors', 'Lights', 'Hue Bridge']) {
      await expect(page.getByRole('link', { name: label }).first()).toBeAttached()
    }
  })
})
