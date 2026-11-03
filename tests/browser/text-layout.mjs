/**
 * Source-anchored text layout check. Run with `node tests/browser/text-layout.mjs`.
 *
 * Cross-platform browser selection lives in ./platform.mjs:
 *   1. CHROME_PATH                      explicit override (any OS)
 *   2. branded Chrome/Edge/Chromium     per-platform install locations
 *   3. Playwright cache build           any complete Chromium, newest revision
 *   4. Playwright's bundled Chromium    needs `npx playwright install chromium`
 *
 * This previously searched only `C:/Program Files/...` (Windows) and passed a
 * possibly-undefined `executablePath` straight into chromium.launch(), so on
 * macOS/Linux it either launched the wrong thing or failed opaquely. Now the
 * resolved binary is named in the output, and if nothing is runnable we say
 * exactly which command fixes it instead of throwing a bare launch error.
 */
import { chromium } from '@playwright/test';
import { build } from 'vite';
import assert from 'node:assert/strict';
import { platformLabel, resolveChromiumExecutable } from './platform.mjs';

let browser;
try {
  const resolved = resolveChromiumExecutable();
  console.log(`[text-layout] ${platformLabel} browser: ${resolved.origin}`);
  if (resolved.note) console.log(`[text-layout] note: ${resolved.note}`);
  browser = await chromium.launch({
    ...(resolved.executablePath ? { executablePath: resolved.executablePath } : {}),
    ...(resolved.channel ? { channel: resolved.channel } : {}),
    headless: true,
  });
} catch (error) {
  // Actionable failure instead of a raw Playwright launch stack trace.
  console.error(
    `[text-layout] FATAL: could not launch a Chromium browser on ${platformLabel}.\n` +
    `  ${String(error).split('\n')[0]}\n` +
    `  Fix: run "npx playwright install chromium" (downloads Playwright's pinned build),\n` +
    `  or set CHROME_PATH=/path/to/chrome to use an existing installation.`,
  );
  process.exit(1);
}

try {
  const bundle = await build({ configFile: false, logLevel: 'error', build: { lib: { entry: 'src/adapters/text.ts', name: 'ReaderText', formats: ['iife'] }, write: false, minify: false } });
  const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(file => file.type === 'chunk').code;
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
  // The adapter re-anchors from a ResizeObserver callback, so the new geometry is
  // not readable synchronously after setViewportSize(). Poll instead of assuming a
  // fixed delay: a bare 80 ms sleep made this a race and the anchor sometimes read
  // back stale (measured: line 665 instead of 333 on a correct implementation).
  const readResized = () => page.evaluate(() => window.textReaderFixture.adapter.getPosition());
  let resized;
  try {
    await page.waitForFunction(() => window.textReaderFixture.adapter.getPosition().locator.line === 333, null, { timeout: 5000 });
    resized = await readResized();
  } catch {
    resized = await readResized();
  }
  assert.equal(resized.locator.line, 333, `Resizing must keep the source anchor (got line ${resized.locator?.line})`);
  assert.ok(Math.abs(resized.fraction - result.before.fraction) < .001, `Progress must use the source, not the scroll height (got ${resized.fraction} vs ${result.before.fraction})`);
  // Deterministic form of the race above. Every restore writes scrollTop, which queues a
  // scroll event; when the host changes size before that event is delivered, the scroll
  // handler runs against the new layout ahead of the ResizeObserver. It must keep the
  // anchor instead of re-capturing it from reflowed geometry (measured drift: 333 -> 665).
  const raced = await page.evaluate(async () => {
    const { adapter, host } = window.textReaderFixture;
    const frames = async count => { for (let i = 0; i < count; i++) await new Promise(done => requestAnimationFrame(done)); };
    const lines = [];
    for (const right of ['45%', '', '30%', '']) {
      await adapter.goTo('333'); await frames(3);
      // Animation-frame callbacks run in FIFO order before ResizeObserver delivery, so the
      // scroll handler's frame callback sees the resized layout before the observer does.
      requestAnimationFrame(() => { host.style.right = right; });
      host.dispatchEvent(new Event('scroll'));
      await frames(6);
      lines.push(adapter.getPosition().locator.line);
    }
    return lines;
  });
  assert.deepEqual(raced, [333, 333, 333, 333], `A scroll delivered after a resize must keep the source anchor (got ${raced.join(', ')})`);
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
  // Same ResizeObserver race as the TXT resize above: poll for the settled anchor.
  let compactLabel = null;
  try {
    await page.waitForFunction(() => window.textReaderFixture.adapter.getPosition().label === 'Heading 20', null, { timeout: 5000 });
  } catch { /* fall through: report what was actually observed */ }
  compactLabel = await page.evaluate(() => window.textReaderFixture.adapter.getPosition().label);
  assert.equal(compactLabel, 'Heading 20', `Markdown anchor must survive compact resize (got ${JSON.stringify(compactLabel)})`);
  console.log(JSON.stringify({ passed: ['TXT source-line jump', 'TXT typography anchor', 'TXT resize anchor', 'source-based progress', 'TXT scroll after resize', 'TXT reopen', 'Markdown outline jump', 'Markdown typography anchor', 'Markdown compact resize'], sourceLine: restored.locator.line }, null, 2));
} finally { await browser.close(); }
