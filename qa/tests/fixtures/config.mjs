import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  testDir: here, testMatch: '*.spec.mjs', workers: 1, retries: 0, timeout: 10000,
  reporter: [[path.join(here, '../../playwright/reporter.mjs')]],
  outputDir: path.join(process.env.QA_RUN_DIR, 'artifacts'),
  use: { baseURL: `http://127.0.0.1:${process.env.FIXTURE_PORT}`, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: `"${process.execPath}" "${path.join(here, '../fixture-server.mjs')}"`,
    url: `http://127.0.0.1:${process.env.FIXTURE_PORT}`, reuseExistingServer: false, timeout: 3000
  }
});
