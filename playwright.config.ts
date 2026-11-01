import { defineConfig, devices } from '@playwright/test'

const ci = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:6190',
    viewport: { width: 1280, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Europe/Brussels',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 900 },
        // `moz-firefox` uses the installed Firefox, where Playwright's own build won't start.
        channel: process.env.PW_FIREFOX_CHANNEL,
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx vite --config vite.e2e.config.ts',
    url: 'http://localhost:6190/e2e/fixture/',
    reuseExistingServer: !ci,
  },
})
