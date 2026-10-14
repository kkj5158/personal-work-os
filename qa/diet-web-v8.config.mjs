import { defineConfig } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: '.', testMatch: 'diet-web-v8.spec.mjs', workers: 1, timeout: 60000,
  outputDir: '../.qa/diet-web-v8/results', reporter: [['list'], ['json', { outputFile: path.resolve('.qa/diet-web-v8/results.json') }]],
  use: { baseURL: 'http://127.0.0.1:13077', browserName: 'chromium', channel: 'chrome', headless: true, viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 13077', url: 'http://127.0.0.1:13077/diet/planner', reuseExistingServer: false, timeout: 120000, cwd: process.cwd() },
});
