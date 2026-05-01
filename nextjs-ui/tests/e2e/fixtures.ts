import { test as base, type Page, type APIRequestContext } from '@playwright/test'

const TEST_USERNAME = process.env.WARREN_AUTH_USERNAME ?? 'e2e'
const TEST_PASSWORD = process.env.WARREN_AUTH_PASSWORD ?? 'e2e-test-password'

export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#username', TEST_USERNAME)
  await page.fill('#password', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
}

export async function loginViaApi(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { username: TEST_USERNAME, password: TEST_PASSWORD },
  })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
}

export const test = base
export { expect } from '@playwright/test'
