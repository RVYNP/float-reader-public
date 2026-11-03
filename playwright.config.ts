import { defineConfig } from '@playwright/test';
import { platform } from 'node:os';
// Shared with tests/browser/*.mjs so the browser rule is defined exactly once.
// @ts-expect-error -- plain ESM helper module, no type declarations needed.
import { resolveChromiumExecutable } from './tests/browser/platform.mjs';

// Browser selection is platform-aware on purpose.
//
// History: this file used to hardcode `channel: 'msedge'`. That is correct only
// on Windows, where Microsoft Edge IS the WebView2 runtime and is therefore
// always installed. macOS and Linux have no Edge, so every test died in
// browserType.launch with "Chromium distribution 'msedge' is not found" before a
// single assertion ran -- green on Windows, dead on arrival elsewhere.
//
// Rule (deterministic; first match wins, see resolveChromiumExecutable):
//   1. CHROME_PATH, when set -- an explicit operator override always wins.
//   2. A branded Chromium-family browser actually found on this OS (Chrome,
//      then Edge, Chromium; Brave on macOS).
//   3. A complete build already unpacked in the Playwright cache, newest
//      revision first. Revision-agnostic on purpose: Playwright 1.64.1
//      nominates chromium-1248, but a machine holding only chromium-1243 still
//      launches and runs the whole suite. Insisting on the exact revision turns
//      a usable install into "Executable doesn't exist", i.e. a download many
//      CI/offline machines either cannot make or should not need.
//   4. Otherwise no explicit executable: Playwright's own bundled Chromium,
//      which needs `npx playwright install chromium` once.
//
// `channel` is passed ONLY when a branded browser was actually detected;
// defaulting to a channel is precisely the bug this replaced.

const browser = resolveChromiumExecutable() as { executablePath?: string; channel?: string; origin: string; note?: string };

// Printed once so a failing launch names the exact binary that was tried.
console.log(`[playwright] ${platform()}/${process.arch} browser: ${browser.origin}${browser.note ? ` -- ${browser.note}` : ''}`);

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:1421',
    ...(browser.channel ? { channel: browser.channel } : {}),
    ...(browser.executablePath ? { launchOptions: { executablePath: browser.executablePath } } : {}),
    viewport: { width: 420, height: 620 },
  },
  webServer: { command: 'npm run dev -- --port 1421', url: 'http://127.0.0.1:1421', reuseExistingServer: true },
  timeout: 30000,
});
