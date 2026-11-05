// Reshoot the README media in docs/media against the current UI: Brief theme, light mode.
// Documents are public-domain scans and books; nothing personal is committed.
// Usage: node scripts/reshoot-media.mjs <page-document.pdf> <book.epub>
//        (dev server must be running on :1420)
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

// Pinned Chrome for Testing on macOS; elsewhere Playwright's own Chromium (`npx playwright install chromium`).
const CHROME = join(process.env.HOME ?? '',
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'media');
const URL = 'http://127.0.0.1:1420/';

// Committed media uses only redistributable documents:
//  - a public-domain scan with a text layer (e.g. Internet Archive "The Half-Tone Process") for PDF
//    shots; pages without one show an "Image-only page" note in every shot,
//  - a public-domain book (e.g. Pride and Prejudice) for EPUB shots.
// In-copyright magazine scans are intentionally NOT committed.
// Pass the two documents as arguments; the README documents the sources used.
const [PDF = '', BOOK = ''] = process.argv.slice(2);
if (!PDF || !BOOK) {
  console.error('usage: node scripts/reshoot-media.mjs <page-document.pdf> <book.epub>');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const COMPACT = { width: 420, height: 620 };
const READING = { width: 1080, height: 680 };
// Composite sheets (hero, themes) follow the portfolio grid: white ground, square corners,
// 14 px gutters, a hairline instead of a shadow.
const GUTTER = 14;
const SHEET_CSS = `body { margin: 0; background: #fff; }
  img { display: block; outline: 1px solid rgba(0,0,0,.08); outline-offset: -1px; }`;

async function open(browser, { viewport = COMPACT, palette = 'brief' } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate(p => {
    localStorage.setItem('hold-my-brief:appearance', JSON.stringify({ mode: 'system', palette: p, accent: null, page: 'theme' }));
  }, palette);
  await page.reload();
  await page.waitForTimeout(800);
  return { ctx, page };
}

async function loadFile(page, path, waitMs = 6000) {
  await page.setInputFiles('#file-input', path);
  await page.waitForTimeout(waitMs);
}

async function jumpTo(page, target) {
  await page.keyboard.press('Control+g');
  await page.waitForTimeout(400);
  await page.fill('#target', String(target));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

async function settle(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  await settle(page);
  return page.locator('#app').screenshot(name ? { path: join(OUT, name) } : {});
}

async function setLibrary(page, open) {
  await page.evaluate(want => {
    const toggle = document.querySelector('#library-toggle');
    if (toggle && (toggle.getAttribute('aria-expanded') === 'true') !== want) toggle.click();
  }, open);
}

const dataUrl = png => `data:image/png;base64,${png.toString('base64')}`;

const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});

// Hero: the print manual as a two-page spread beside the book in the default compact window,
// one row at equal height.
{
  const wide = { width: 820, height: COMPACT.height };
  let spread, compact;
  {
    const { ctx, page } = await open(browser, { viewport: wide });
    await loadFile(page, PDF, 9000);
    await jumpTo(page, 48);
    await setLibrary(page, false);
    await page.click('#view-spread');
    await page.waitForTimeout(1500);
    spread = await shot(page);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser);
    await loadFile(page, BOOK, 6000);
    compact = await shot(page);
    await ctx.close();
  }
  const width = wide.width + GUTTER + COMPACT.width;
  const sheet = await browser.newPage({ viewport: { width, height: COMPACT.height }, deviceScaleFactor: 2 });
  await sheet.setContent(`<style>${SHEET_CSS}
    .row { display: flex; gap: ${GUTTER}px; width: ${width}px; } img { height: ${COMPACT.height}px; }
  </style><div class="row"><img src="${dataUrl(spread)}"><img src="${dataUrl(compact)}"></div>`);
  await sheet.locator('.row').screenshot({ path: join(OUT, 'hero.png') });
  await sheet.close();
  console.log('hero');
}

// hand tool on a zoomed page
{
  const { ctx, page } = await open(browser);
  await loadFile(page, PDF, 9000);
  await jumpTo(page, 48);
  await page.click('#zoom-in');
  await page.click('#zoom-in');
  await page.click('#hand-tool');
  await page.waitForTimeout(1000);
  await shot(page, 'hand-tool.png');
  await ctx.close();
  console.log('hand-tool');
}

// library drawer over the page (the animated resize demo is scripts/record-library-demo.mjs).
{
  const { ctx, page } = await open(browser, { viewport: READING });
  await loadFile(page, PDF, 9000);
  await jumpTo(page, 48);
  await setLibrary(page, true);
  await page.waitForTimeout(900);
  await shot(page, 'library.png');
  await ctx.close();
  console.log('library');
}

// Appearance panel
{
  const { ctx, page } = await open(browser);
  await loadFile(page, BOOK, 6000);
  await page.click('#menu-toggle');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.waitForTimeout(900);
  await shot(page, 'appearance.png');
  await ctx.close();
  console.log('appearance');
}

// Theme sheet: every family reading the public-domain opening of Pride and Prejudice,
// composed into one row.
{
  const opening = [
    '# Chapter I',
    'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.',
    'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
    '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
  ].join('\n\n');
  const families = ['brief', 'lilac', 'birch', 'graphite', 'arctic'];
  const cells = [];
  for (const palette of families) {
    const { ctx, page } = await open(browser, { palette });
    await page.setInputFiles('#file-input', { name: 'Pride and Prejudice.md', mimeType: 'text/markdown', buffer: Buffer.from(opening) });
    await page.waitForTimeout(1200);
    cells.push(await shot(page));
    await ctx.close();
  }
  const sheet = await browser.newPage({ viewport: { width: 880, height: 400 }, deviceScaleFactor: 2 });
  await sheet.setContent(`<style>${SHEET_CSS}
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); column-gap: ${GUTTER}px; row-gap: 8px; width: 880px; }
    .label { font: 700 11px/1 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .02em; color: rgba(0,0,0,.75); }
    img { width: 100%; }
  </style><div class="grid">${families.map(f => `<div class="label">${f.toUpperCase()}</div>`).join('')}${cells.map(c => `<img src="${dataUrl(c)}">`).join('')}</div>`);
  await sheet.locator('.grid').screenshot({ path: join(OUT, 'themes.png') });
  await sheet.close();
  console.log('themes');
}

await browser.close();
console.log('done');
