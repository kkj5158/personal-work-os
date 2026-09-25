import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.QA_RUN_ID) throw new Error('Use npm run qa:integration -- money (managed lifecycle required)');
const adapter = (await import(pathToFileURL(path.join(here, '../suites', process.env.QA_SYSTEM, 'adapter.mjs')))).default;
export default defineConfig({
  testDir: path.join(here, '../suites', process.env.QA_SYSTEM),
  testMatch: '**/*.spec.mjs',
  timeout: 45000, globalTimeout: 150000,
  expect: { timeout: 10000 }, workers: 1, retries: 0, forbidOnly: true,
  outputDir: path.join(process.env.QA_RUN_DIR, 'browser-artifacts'),
  reporter: [[path.join(here, 'reporter.mjs')]],
  use: {
    baseURL: process.env.QA_BASE_URL,
    browserName: 'chromium', headless: true,
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 }
  },
  webServer: {
    // Official Playwright lifecycle owns the entire frontend process tree.
    command: `"${process.execPath}" "${path.join(here, '../runtime/frontend.mjs')}"`,
    cwd: process.env.QA_TARGET,
    url: process.env.QA_BASE_URL + adapter.route,
    reuseExistingServer: false, timeout: 60000,
    stdout: 'pipe', stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }
  }
});
