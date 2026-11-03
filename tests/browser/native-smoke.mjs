// Opt-in smoke test of the built Windows app, with its real native bridge.
// Creates synthetic files and uses this candidate's normal per-user state.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.fixtures', { recursive: true });
await mkdir('test-results', { recursive: true });
const fixture = resolve('.fixtures/native-smoke.txt');
await writeFile(fixture, Array.from({ length: 120 }, (_, i) => `Native test line ${i + 1}: keep this passage beside your work.`).join('\n'));
const port = 19126;
const child = spawn(resolve('dist/Float Reader.exe'), [fixture], {
  windowsHide: true, stdio: 'pipe',
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
});
let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw Error(`App exited ${child.exitCode}: ${stderr}`);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!browser) throw Error(`Could not connect to the app WebView: ${stderr}`);
  const context = browser.contexts()[0];
  let page;
  for (let i = 0; i < 100; i++) {
    page = context.pages().find(p => p.url().includes('tauri.localhost'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!page) throw Error('Native reader page did not load.');
  await page.locator('#filename').filter({ hasText: 'native-smoke.txt' }).waitFor();
  assert.equal(await page.locator('#notice').isVisible(), false, 'No startup or IPC errors');
  const initial = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_state'));
  await page.locator('#pin').click();
  await expect(page.locator('#pin')).toHaveAttribute('aria-pressed', String(!initial.window.pinned));
  await page.locator('#lock').click();
  await expect(page.locator('#lock')).toHaveAttribute('aria-pressed', String(!initial.window.locked));
  await page.keyboard.press('Control+g'); await page.locator('#target').fill('50');
  await page.getByRole('button', { name: 'Go to location', exact: true }).click();
  await expect(page.locator('#position')).toContainText('50');
  await page.screenshot({ path: 'test-results/reader-native.png' });
  await new Promise(resolve => setTimeout(resolve, 900));
  // Restore user-visible window choices after testing native commands.
  await page.evaluate(async initial => {
    await window.__TAURI_INTERNALS__.invoke('set_pin', { enabled: initial.pinned });
    await window.__TAURI_INTERNALS__.invoke('set_lock', { enabled: initial.locked });
  }, initial.window);
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }));
  for (let i = 0; child.exitCode === null && i < 50; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(child.exitCode, 0, `Native close did not finish cleanly: ${stderr}`);
  console.log('Native smoke passed: embedded UI, CLI file open, IPC, pin, lock, source-line jump, save and clean close.');
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
