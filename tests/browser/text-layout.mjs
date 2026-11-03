/** Run with `node tests/browser/text-layout.mjs`; uses an installed Chrome or Edge. */
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const bundle = await build({ configFile: false, logLevel: 'error', build: { lib: { entry: 'src/adapters/text.ts', name: 'ReaderText', formats: ['iife'] }, write: false, minify: false } });
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(file => file.type === 'chunk').code;
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 620 } });
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: code });
  const result = await page.evaluate(async () => {
    const { TextAdapter } = window.ReaderText;
    const defaultOptions = { fontSize: 18, lineHeight: 1.65, margin: 24, wrap: true, fit: 'page', zoom: 1, rotation: 0 };
    document.body.innerHTML = '<main id="reader" style="position:fixed;inset:0;overflow:auto"></main>';
    const host = document.getElementById('reader');
    const source = Array.from({ length: 1000 }, (_, index) => `Line ${index + 1}: A longer source line containing Unicode 🦋 and enough text to wrap in the compact reader. This passage must stay in view after typography changes.`).join('\n');
    const adapter = new TextAdapter();
    const context = { onPosition() {}, onError(error) { throw error; }, async openExternal() {}, async requestPassword() { return null; } };
    await adapter.open({ name: 'anchor.txt', format: 'txt', bytes: new TextEncoder().encode(source) }, host, context, defaultOptions);
    await adapter.goTo('333');
    const before = adapter.getPosition();
    await adapter.setOptions({ ...defaultOptions, fontSize: 28, margin: 40 });
    const after = adapter.getPosition();
    window.textReaderFixture = { adapter, host, before, defaultOptions, source, context };
    return { before, after };
  });
  assert.equal(result.before.locator.line, 333, 'TXT Go to must land at the requested source line');
  assert.equal(result.after.locator.line, 333, 'Changing typography must keep the same source line');
  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(80);
  const resized = await page.evaluate(() => window.textReaderFixture.adapter.getPosition());
  assert.equal(resized.locator.line, 333, 'Resizing must keep the source anchor');
  assert.ok(Math.abs(resized.fraction - result.before.fraction) < .001, 'Progress must use the source, not the scroll height');
  const restored = await page.evaluate(async () => {
    const { adapter, before, host, defaultOptions, source, context } = window.textReaderFixture;
    const { TextAdapter } = window.ReaderText;
    adapter.destroy();
    const replacement = new TextAdapter();
    await replacement.open({ name: 'renamed.txt', format: 'txt', bytes: new TextEncoder().encode(source) }, host, context, defaultOptions);
    await replacement.restore(before.locator);
    const position = replacement.getPosition();
    replacement.destroy();
    return position;
  });
  assert.equal(restored.locator.line, 333, 'Reopen must restore the same source line');
  const markdown = await page.evaluate(async () => {
    const { TextAdapter } = window.ReaderText;
    const { defaultOptions, context, host } = window.textReaderFixture;
    const adapter = new TextAdapter();
    const source = Array.from({ length: 40 }, (_, index) => `## Heading ${index + 1}\n\nParagraph ${index + 1}. ${'Stable content anchor, with **Markdown** formatting. '.repeat(35)}\n`).join('\n');
    await adapter.open({ name: 'headings.md', format: 'md', bytes: new TextEncoder().encode(source) }, host, context, defaultOptions);
    await adapter.goTo('heading:heading-20');
    const before = adapter.getPosition();
    await adapter.setOptions({ ...defaultOptions, fontSize: 24 });
    const after = adapter.getPosition();
    window.textReaderFixture.adapter = adapter;
    return { before, after };
  });
  assert.equal(markdown.before.label, 'Heading 20', 'Outline jumps must land at their heading');
  assert.equal(markdown.after.label, 'Heading 20', 'Markdown anchor must survive font changes');
  await page.setViewportSize({ width: 360, height: 420 });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.textReaderFixture.adapter.getPosition().label), 'Heading 20', 'Markdown anchor must survive compact resize');
  console.log(JSON.stringify({ passed: ['TXT source-line jump', 'TXT typography anchor', 'TXT resize anchor', 'source-based progress', 'TXT reopen', 'Markdown outline jump', 'Markdown typography anchor', 'Markdown compact resize'], sourceLine: restored.locator.line }, null, 2));
} finally { await browser.close(); }
