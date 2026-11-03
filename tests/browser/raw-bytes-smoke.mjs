// Smoke: open raw bytes via the real native bridge and verify an ArrayBuffer arrives.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('.fixtures', { recursive: true });
const pdf = resolve('.fixtures/swap-a.pdf');
const stream = (text) => `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
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

const port = 19127;
const child = spawn(resolve('dist/Float Reader.exe'), [pdf], { windowsHide: true, stdio: 'pipe', env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } });
let browser;
try {
  for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw Error(`App exited ${child.exitCode}`); try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  if (!browser) throw Error('Could not connect to app WebView');
  const context = browser.contexts()[0];
  let page;
  for (let i = 0; i < 100; i++) {
    page = context.pages().find(p => p.url().includes('tauri.localhost'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!page) throw Error('Reader page not found');
  await page.locator('#filename').filter({ hasText: 'swap-a.pdf' }).waitFor();
  const result = await page.evaluate(async (p) => {
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