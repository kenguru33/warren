import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.WARREN_BASE_URL ?? 'http://localhost:3000'

// When WARREN_BASE_URL is set we're testing against an existing stack (Docker or
// a manually-started prod server) — skip the bundled dev server. Otherwise we
// boot `next dev` for local iteration.
const useExternalServer = !!process.env.WARREN_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'list',
  timeout: 30_000,

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: useExternalServer
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          WARREN_AUTH_USERNAME: 'e2e',
          WARREN_AUTH_PASSWORD: 'e2e-test-password',
          WARREN_SESSION_PASSWORD: process.env.WARREN_SESSION_PASSWORD ?? 'a-very-long-session-password-for-tests-only-32+chars',
          HUE_FAKE: '1',
          WARREN_DATA_DIR: './.data-e2e',
        },
      },
})
