import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/browser.spec.mjs',
  timeout: 45000,
  expect: {timeout: 10000},
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results/browser',
  reporter: [['list'], ['json', {outputFile: 'test-results/browser-results.json'}]],
  use: {baseURL: process.env.QC_BASE_URL || 'http://127.0.0.1:8080', trace: 'retain-on-failure'},
  projects: [
    {name: 'chrome', use: {browserName: 'chromium', channel: 'chrome', viewport: {width: 1440, height: 1000}}},
    {name: 'edge', use: {browserName: 'chromium', channel: 'msedge', viewport: {width: 1440, height: 1000}}},
    {name: 'mobile', use: {browserName: 'chromium', channel: 'chrome', viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}}
  ]
});
