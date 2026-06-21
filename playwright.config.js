import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3333',
    trace: 'on-first-retry',
  },
  webServer: process.env.PLAYWRIGHT_SKIP_SERVER
    ? undefined
    : {
      command: 'npm run dev',
      url: 'http://localhost:3333',
      reuseExistingServer: true,
      timeout: 120_000,
    },
})
