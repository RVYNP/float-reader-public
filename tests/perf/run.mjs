// Performance harness for the reader adapters (PRD PERF-01..PERF-06 classes).
//
// Runs the built production bundle in a real Chromium against synthetic, deterministic
// fixtures, so the numbers are comparable between runs and between machines.
//
//   node tests/perf/run.mjs                    # human-readable table
//   node tests/perf/run.mjs --json             # machine-readable
//   node tests/perf/run.mjs --only=pdf         # one suite
//   node tests/perf/run.mjs --baseline=file.json --record=file.json
//
// Notes
// - Measured in headless Chromium, not in the OS WebView. It measures the reader's own
//   work (decode, layout, paint, adapter logic), not the browser shell. Absolute values
//   will differ from the packaged app; relative before/after values will not.
// - Memory is read with performance.measureUserAgentSpecificMemory() where available
//   (Chromium, cross-origin isolated context). It is reported for the page only.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { textPdf, plainText, markdown, reflowableEpub } from './fixtures.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const DIST = join(ROOT, 'dist');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));

// ---------------------------------------------------------------------------- browser

/** Prefer an explicitly configured browser, then any complete Chromium in the Playwright cache. */
async function chromiumPath() {
  const explicit = process.env.CHROME_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const platforms = { darwin: 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', win32: 'chrome-win/chrome.exe', linux: 'chrome-linux/chrome' };
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  let entries = [];
  try { entries = await readdir(cache); } catch { return undefined; }
  // Newest revision first so a newer complete download wins over an older one.
  const builds = entries.filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const build of builds) {
    for (const layout of Object.values(platforms)) {
      const candidate = join(cache, build, layout);
      if (existsSync(candidate)) return candidate;
    }
  }
  // Other common cache locations.
  const fallbacks = [join(homedir(), 'AppData/Local/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
  for (const dir of [...fallbacks, join(homedir(), 'Library/Caches/ms-playwright')]) {
    let other = [];
    try { other = await readdir(dir); } catch { continue; }
    for (const build of other.filter(name => /^chromium-\d+$/.test(name))) {
      for (const layout of Object.values(platforms)) {
        const candidate = join(dir, build, layout);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

/** Static server for the built bundle, with the MIME types the PDF worker and EPUB frames need. */
async function serve() {
  const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.json': 'application/json' };
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    // The harness page needs a cross-origin-isolated context for precise memory readings.
    const headers = { 'content-type': 'text/html', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
    try {
      if (path === '/harness.html') { response.writeHead(200, headers); response.end('<!doctype html><meta charset="utf-8"><title>harness</title>'); return; }
      const data = await readFile(join(DIST, path === '/' ? 'index.html' : path));
      response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
      response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/** Locates the built chunk that exports an adapter class, without hard-coding hashed names. */
async function adapterChunk(origin, name) {
  const directory = join(DIST, 'assets');
  const matches = [];
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.js')) continue;
    const body = await readFile(join(directory, file), 'utf8');
    if (body.includes(` as ${name}`)) matches.push({ file, size: body.length });
  }
  if (!matches.length) throw new Error(`Could not find the built chunk exporting ${name}. Run \`npm run build\` first.`);
  // Chunks re-exporting through a barrel also match; the real adapter module is the one that
  // declares the class, which Vite emits in a separate file from the entry.
  const owned = [];
  for (const match of matches) {
    const body = await readFile(join(directory, match.file), 'utf8');
    if (new RegExp(`class\\s+\\w+\\s*[{\\s]`).test(body) && body.includes(name)) owned.push(match);
  }
  const chosen = (owned.length ? owned : matches).sort((a, b) => a.size - b.size)[0];
  return `${origin}/assets/${chosen.file}`;
}

// -------------------------------------------------------------------------- measuring

const now = () => Number(process.hrtime.bigint()) / 1e6;
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { p50: at(.5), p95: at(.95), max: sorted.at(-1), mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, n: sorted.length };
};

/** Opens a fresh page wired to the built bundle and returns helpers. */
async function session(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 420, height: 620 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/harness.html`);
  // Adapter modules may pull shared chunks that touch the app shell; give them a host to find.
  await page.evaluate(() => { document.body.innerHTML = '<div id="app"></div>'; });
  return { page, errors };
}

const PERF_OPTIONS = { fontSize: 18, lineHeight: 1.65, margin: 24, wrap: true, fit: 'page', zoom: 1, rotation: 0 };

// ---------------------------------------------------------------------------- suites

/** PDF: cold open to visible page, then sustained page-turn latency and settled memory. */
async function pdfSuite(browser, origin) {
  const chunk = await adapterChunk(origin, 'PdfAdapter');
  const bytes = textPdf({ pages: 120 }).toString('base64');
  const { page, errors } = await session(browser, origin);
  try {
    const open = await page.evaluate(async ({ chunk, bytes, options }) => {
      const { PdfAdapter } = await import(chunk);
      document.body.innerHTML = '<main id="reader" class="pdf-reader" style="position:fixed;inset:0;overflow:auto"></main>';
      const host = document.getElementById('reader');
      const adapter = new PdfAdapter();
      const started = performance.now();
      await adapter.open({ name: 'perf.pdf', format: 'pdf', bytes: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }, host, { onPosition() {}, onError(e) { console.error(e); }, async openExternal() {}, async requestPassword() { return null; } }, options);
      // First usable content = the frame in which the canvas has painted.
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      window.__perf = { adapter, host };
      return { ms: performance.now() - started, spans: host.querySelectorAll('.textLayer span').length };
    }, { chunk, bytes, options: PERF_OPTIONS });

    // Sequential page turns, including the back/forward pattern a reader actually uses.
    const turns = await page.evaluate(async () => {
      const { adapter } = window.__perf;
      const times = [];
      for (let index = 0; index < 20; index++) {
        const started = performance.now();
        await adapter.navigate(index < 10 ? 'next' : 'previous');
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        times.push(performance.now() - started);
      }
      return times;
    });

    // Repeated round trips exercise the render path's allocation churn (PERF-06 style growth).
    const churn = await page.evaluate(async () => {
      const { adapter } = window.__perf;
      const started = performance.now();
      for (let index = 0; index < 120; index++) await adapter.navigate(index % 2 ? 'previous' : 'next');
      return performance.now() - started;
    });

    const memory = await page.evaluate(async () => {
      if (!performance.measureUserAgentSpecificMemory) return null;
      try {
        const result = await performance.measureUserAgentSpecificMemory();
        return { bytes: result.bytes };
      } catch { return null; }
    });

    return {
      openToFirstContentMs: open.ms,
      textSpans: open.spans,
      pageTurn: stats(turns),
      roundTrips120Ms: churn,
      pageMemoryBytes: memory?.bytes ?? null,
      errors,
    };
  } finally { await page.close(); }
}

/** Markdown and plain text: open time, scrolling cost, anchor restoration. */
async function textSuite(browser, origin) {
  const chunk = await adapterChunk(origin, 'TextAdapter');
  const cases = [
    { name: 'markdown-120KiB', format: 'md', bytes: markdown({ sections: 60 }).toString('base64') },
    { name: 'text-1MiB', format: 'txt', bytes: plainText({ megabytes: 1 }).toString('base64') },
  ];
  const results = [];
  for (const item of cases) {
    const { page, errors } = await session(browser, origin);
    try {
      const result = await page.evaluate(async ({ chunk, item, options }) => {
        const { TextAdapter } = await import(chunk);
        document.body.innerHTML = '<main id="reader" style="position:fixed;inset:0;overflow:auto"></main>';
        const host = document.getElementById('reader');
        const adapter = new TextAdapter();
        const started = performance.now();
        await adapter.open({ name: 'perf', format: item.format, bytes: Uint8Array.from(atob(item.bytes), c => c.charCodeAt(0)) }, host, { onPosition() {}, onError(e) { console.error(e); }, async openExternal() {}, async requestPassword() { return null; } }, options);
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const open = performance.now() - started;
        const elements = host.querySelectorAll('*').length;
        // Restoring an anchor is what happens on every reopen and every typography change.
        const position = adapter.getPosition();
        const restoreTimes = [];
        for (let index = 0; index < 10; index++) {
          const begin = performance.now();
          await adapter.restore(position.locator);
          await new Promise(done => requestAnimationFrame(done));
          restoreTimes.push(performance.now() - begin);
        }
        // Option changes exercise full relayout + anchor recovery.
        const optionStart = performance.now();
        await adapter.setOptions({ ...options, fontSize: 24, margin: 40 });
        const optionMs = performance.now() - optionStart;
        adapter.destroy();
        return { open, elements, restoreTimes, optionMs };
      }, { chunk, item, options: PERF_OPTIONS });
      results.push({ name: item.name, openMs: result.open, domElements: result.elements, restore: stats(result.restoreTimes), typographyRelayoutMs: result.optionMs, errors });
    } finally { await page.close(); }
  }
  return results;
}

/** EPUB: open cost (archive + spine weight indexing) and page navigation. */
async function epubSuite(browser, origin) {
  const chunk = await adapterChunk(origin, 'EpubAdapter');
  const bytes = reflowableEpub({ sections: 30 }).toString('base64');
  const { page, errors } = await session(browser, origin);
  try {
    const result = await page.evaluate(async ({ chunk, bytes, options }) => {
      const { EpubAdapter } = await import(chunk);
      document.body.innerHTML = '<main id="reader" style="position:fixed;inset:0;overflow:hidden"></main>';
      const host = document.getElementById('reader');
      const adapter = new EpubAdapter();
      const started = performance.now();
      await adapter.open({ name: 'perf.epub', format: 'epub', bytes: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }, host, { onPosition() {}, onError(e) { console.error(e); }, async openExternal() {}, async requestPassword() { return null; } }, options);
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const open = performance.now() - started;
      const turns = [];
      for (let index = 0; index < 10; index++) {
        const begin = performance.now();
        await adapter.navigate('next');
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        turns.push(performance.now() - begin);
      }
      adapter.destroy();
      return { openMs: open, pageTurn: { p50: turns.sort((a, b) => a - b)[5], max: Math.max(...turns), n: turns.length } };
    }, { chunk, bytes, options: PERF_OPTIONS });
    return { ...result, errors };
  } finally { await page.close(); }
}

// ------------------------------------------------------------------------------ main

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Build the app first: npm run build');
  process.exit(1);
}

const executablePath = await chromiumPath();
const browser = await chromium.launch({ headless: true, executablePath, args: ['--enable-precise-memory-info'] });
const started = now();
const report = { generatedAt: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, node: process.version, browser: browser.version(), suites: {} };
try {
  const { server, origin } = await serve();
  const only = args.only;
  if (!only || only === 'pdf') report.suites.pdf = await pdfSuite(browser, origin);
  if (!only || only === 'text') report.suites.text = await textSuite(browser, origin);
  if (!only || only === 'epub') report.suites.epub = await epubSuite(browser, origin);
  server.close();
} finally { await browser.close(); }
report.wallMs = now() - started;

if (args.record) await writeFile(args.record, JSON.stringify(report, null, 2));
if (args.json) { console.log(JSON.stringify(report, null, 2)); }
else {
  const fmt = value => value === null || value === undefined ? 'n/a' : typeof value === 'number' ? (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10) : value;
  console.log(`\nFloat Reader performance · ${report.platform} · Chromium ${report.browser}\n`);
  if (report.suites.pdf) {
    const pdf = report.suites.pdf;
    console.log('PDF (120 pages, text)');
    console.log(`  open → first painted page      ${fmt(pdf.openToFirstContentMs)} ms`);
    console.log(`  page turn p50 / p95 / max      ${fmt(pdf.pageTurn.p50)} / ${fmt(pdf.pageTurn.p95)} / ${fmt(pdf.pageTurn.max)} ms  (target p95 ≤ 100 ms cached)`);
    console.log(`  120 forward/back round trips   ${fmt(pdf.roundTrips120Ms)} ms`);
    if (pdf.pageMemoryBytes) console.log(`  page memory after session      ${fmt(pdf.pageMemoryBytes / 1048576)} MiB`);
    const baseline = args.baseline && JSON.parse(await readFile(args.baseline, 'utf8')).suites.pdf;
    if (baseline) {
      const ratio = relative => baseline[relative] ? `${((pdf[relative] / baseline[relative] - 1) * 100).toFixed(1)}%` : n/a;
      console.log(`  vs baseline: open ${ratio('openToFirstContentMs')}, turn p50 ${(pdf.pageTurn.p50 / baseline.pageTurn.p50 > 0 ? ((pdf.pageTurn.p50 / baseline.pageTurn.p50 - 1) * 100).toFixed(1) : '0')}%, round trips ${ratio('roundTrips120Ms')}`);
    }
    if (pdf.errors.length) console.log(`  errors: ${pdf.errors.join('; ')}`);
    console.log('');
  }
  if (report.suites.text) {
    console.log('Text');
    for (const item of report.suites.text) {
      console.log(`  ${item.name.padEnd(16)} open ${fmt(item.openMs)} ms · ${item.domElements} nodes · restore p50 ${fmt(item.restore.p50)} ms · typography ${fmt(item.typographyRelayoutMs)} ms`);
    }
    console.log('');
  }
  if (report.suites.epub) {
    console.log(`EPUB (30 chapters)  open ${fmt(report.suites.epub.openMs)} ms · page turn p50 ${fmt(report.suites.epub.pageTurn.p50)} ms\n`);
  }
  console.log(`Wall time ${Math.round(report.wallMs)} ms\n`);
}
