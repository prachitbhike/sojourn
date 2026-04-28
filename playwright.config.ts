import { defineConfig, devices } from '@playwright/test';

const API_PORT = Number.parseInt(process.env.E2E_API_PORT ?? '3000', 10);
const WEB_PORT = Number.parseInt(process.env.E2E_WEB_PORT ?? '5173', 10);
const E2E_DB_FILE = process.env.E2E_DATABASE_URL ?? 'file:./e2e.local.db';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @sojourn/api dev',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DB_FILE,
        MIGRATE_ON_BOOT: '1',
        STUB_SOURCE: 'local',
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        EDIT_KEY_PEPPER: 'e2e-pepper',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm --filter @sojourn/web dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: {
        API_PORT: String(API_PORT),
      },
    },
  ],
});
