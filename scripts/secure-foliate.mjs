import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Windows WebView2 does not need Foliate's WebKit allow-scripts workaround.
// Patch before bundling: changing a frame after navigation is too late.
for (const filename of ['paginator.js', 'fixed-layout.js']) {
  const path = resolve('node_modules/foliate-js', filename);
  const original = await readFile(path, 'utf8');
  const hardened = original.replaceAll("'allow-same-origin allow-scripts'", "'allow-same-origin'");
  if (!hardened.includes("setAttribute('sandbox', 'allow-same-origin')") || hardened.includes('allow-same-origin allow-scripts'))
    throw new Error(`Foliate sandbox patch needs review: ${filename}`);
  await writeFile(path, hardened);
}
await mkdir('public/pdfjs', { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(resolve('node_modules/pdfjs-dist', directory), resolve('public/pdfjs', directory), { recursive: true });
}
console.log('EPUB frames prohibit scripts; PDF auxiliary assets copied for offline use.');
