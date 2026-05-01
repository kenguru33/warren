import { test, expect } from './fixtures'

test.describe('auth', () => {
  test('redirects unauthenticated users from / to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('rejects bad credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'nope')
    await page.fill('#password', 'nope')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/invalid credentials/i)).toBeVisible()
  })

  test('accepts valid credentials and lands on dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', process.env.WARREN_AUTH_USERNAME ?? 'e2e')
    await page.fill('#password', process.env.WARREN_AUTH_PASSWORD ?? 'e2e-test-password')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  })

  test('rejects unauthenticated /api requests with 401', async ({ request }) => {
    const res = await request.get('/api/rooms')
    expect(res.status()).toBe(401)
  })
})
