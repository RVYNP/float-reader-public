import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://127.0.0.1:1421', channel: 'msedge', viewport: { width: 420, height: 620 } }, webServer: { command: 'npm run dev -- --port 1421', url: 'http://127.0.0.1:1421', reuseExistingServer: true }, timeout: 30000 });
