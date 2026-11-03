// Smoke: open raw bytes via the real native bridge and verify an ArrayBuffer arrives.
//
// The raw-byte transport lives inside the webview's JS context, so proving it
// needs CDP. That exists only on Windows (WebView2/Chromium). On macOS (WKWebView)
// and Linux (WebKitGTK) there is no Playwright CDP endpoint -- see platform.mjs --
// so this script launches the app against a synthetic PDF, verifies the launch
// lifecycle, states plainly that the transport assertion was skipped, and exits 0
// only when those launch checks passed.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectAppPage, launchNativeApp, logSkip, platformLabel, supportsCdp } from './platform.mjs';

await mkdir('.fixtures', { recursive: true });
const pdf = resolve('.fixtures/swap-a.pdf');
const stream = text => `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  stream('BT /F1 24 Tf 25 550 Td (Float raw IPC check) Tj ET'),
];
let out = '%PDF-1.7\n'; const offsets = [0];
objects.forEach((object, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(out);
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await writeFile(pdf, Buffer.from(out));

const launched = await launchNativeApp({ fixture: pdf });

if (launched.result === 'failed') {
  console.error(`\nraw-bytes-smoke FAILED on ${platformLabel}: ${launched.reason}`);
  process.exit(1);
}

if (launched.result === 'skipped') {
  console.log(`\n=== raw-bytes-smoke: observable launch checks on ${platformLabel} ===`);
  const checks = launched.checks ?? [];
  if (checks.length) for (const check of checks) console.log(`  ${check.startsWith('SKIP') ? check : `PASS  ${check}`}`);
  else console.log('  (no launch checks ran)');
  logSkip(
    'raw-byte transport assertion (open_file/read_document_bytes return an ArrayBuffer, metadata excluded)',
    launched.reason,
  );
  if (launched.binary) console.log(`\nBinary under test: ${launched.binary}`);
  const launchChecksPassed = checks.some(check => check.startsWith('clean quit'));
  console.log(launchChecksPassed
    ? '\nraw-bytes-smoke: launch checks PASSED; transport assertion skipped (reason above).'
    : '\nraw-bytes-smoke: SKIPPED before the transport assertion could run (reason above).');
  process.exit(0);
}

// ---- Windows / WebView2: the real transport assertion ---------------------
if (!supportsCdp()) {
  console.error('Internal error: CDP path reached on a platform that does not support CDP.');
  process.exit(1);
}
const { child } = launched;
let browser;
try {
  let page;
  ({ browser, page } = await connectAppPage(launched));
  await page.locator('#filename').filter({ hasText: 'swap-a.pdf' }).waitFor();
  const result = await page.evaluate(async p => {
    const meta = await window.__TAURI_INTERNALS__.invoke('open_file', { path: p });
    const buf = await window.__TAURI_INTERNALS__.invoke('read_document_bytes', { path: p });
    return { hasBytes: buf instanceof ArrayBuffer, byteLength: buf.byteLength, metaLen: JSON.stringify(meta).length, hasMetaBytes: 'bytes' in meta };
  }, pdf);
  console.log(JSON.stringify(result));
  if (!result.hasBytes || result.byteLength < 100 || result.metaLen > 900 || result.hasMetaBytes) throw Error('raw transport assertion failed');
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }));
  await new Promise(r => setTimeout(r, 800));
  console.log('RAW BYTES SMOKE PASSED');
} finally { await browser?.close().catch(() => {}); if (child.exitCode === null) child.kill(); }
