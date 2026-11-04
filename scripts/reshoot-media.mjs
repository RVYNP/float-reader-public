// Reshoot docs/media screenshots against the rebranded UI (Brief theme).
// Documents are print/creative reference scans and guides; nothing personal is committed.
// Usage: node scripts/reshoot-media.mjs   (dev server must be running on :1420)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const CHROME = join(process.env.HOME,
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'media');
const URL = 'http://127.0.0.1:1420/';

// Committed media uses only redistributable documents:
//  - a public-domain scan (e.g. Internet Archive "Photo-engraving") for PDF shots,
//  - a permissively licensed book (e.g. Adobe's Apache-2.0 Photoshop UXP guide) for EPUB shots.
// In-copyright magazine scans are intentionally NOT committed.
// Pass the two documents as arguments; the README documents the sources used.
const [PDF = '', GUIDE = ''] = process.argv.slice(2);
if (!PDF || !GUIDE) {
  console.error('usage: node scripts/reshoot-media.mjs <page-document.pdf> <reflowable.epub>');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const COMPACT = { width: 420, height: 620 };
const READING = { width: 760, height: 900 };

async function open(browser, { scheme = 'light', viewport = COMPACT, palette = 'brief' } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme });
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

async function shot(page, name) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(200);
  return page.locator('#app').screenshot({ path: join(OUT, name) });
}

const browser = await chromium.launch({ executablePath: CHROME });

// hero — a 1996 print design magazine open in the compact window
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await open(browser, { scheme });
  await loadFile(page, PDF, 9000);
  await jumpTo(page, 48);
  await shot(page, `hero-${scheme}.png`);
  await ctx.close();
  console.log('hero-' + scheme);
}

// reading a reflowable EPUB (creative-app reference guide)
{
  const { ctx, page } = await open(browser, { scheme: 'light' });
  await loadFile(page, GUIDE, 6000);
  await shot(page, 'reading-epub.png');
  await ctx.close();
  console.log('reading-epub');
}

// two-page spread
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await open(browser, { scheme, viewport: READING });
  await loadFile(page, PDF, 9000);
  await jumpTo(page, 48);
  await page.click('#view-spread');
  await page.waitForTimeout(1500);
  await shot(page, `spread-${scheme}.png`);
  await ctx.close();
  console.log('spread-' + scheme);
}

// hand tool on a zoomed page
{
  const { ctx, page } = await open(browser, { scheme: 'light' });
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

// library drawer over the page, then dragged wider.
// The drawer is open by default; the handle carries role=separator.
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await open(browser, { scheme, viewport: READING });
  await loadFile(page, PDF, 9000);
  await jumpTo(page, 48);
  await page.evaluate(() => {
    const toggle = document.querySelector('#library-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
  });
  await page.waitForTimeout(900);
  await shot(page, `library-${scheme}.png`);

  const box = await page.locator('[role="separator"]').boundingBox();
  if (!box || !box.width) throw new Error('library resize handle not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 240, box.y + box.height / 2, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const width = await page.evaluate(() => document.querySelector('[role="separator"]')?.getAttribute('aria-valuenow'));
  console.log(`  library width after drag: ${width}`);
  await shot(page, `library-resize-${scheme}.png`);
  await ctx.close();
  console.log('library-' + scheme);
}

// Appearance panel
{
  const { ctx, page } = await open(browser, { scheme: 'light' });
  await loadFile(page, GUIDE, 6000);
  await page.click('#menu-toggle');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.waitForTimeout(900);
  await shot(page, 'appearance.png');
  await ctx.close();
  console.log('appearance');
}

await browser.close();
console.log('done');
