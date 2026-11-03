import { test, expect } from '@playwright/test';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { createHash } from 'node:crypto';

async function recordFixture(name: string, buffer: Buffer, properties: Record<string, unknown>) {
  await test.info().attach('fixture-manifest.json', { body: JSON.stringify({ schema: 1, name, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), origin: 'Synthetic, generated from this test source', ...properties }, null, 2), contentType: 'application/json' });
}

function pdfFixture() {
  const stream = (text: string) => `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >>] >> >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R /Annots [10 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 6 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 1200] /Resources << /Font << /F1 6 0 R >> >> /Contents 9 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    stream('BT /F1 24 Tf 25 550 Td (First page with selectable text) Tj ET'),
    stream('BT /F1 24 Tf 25 350 Td (Second page landscape) Tj ET'),
    stream('BT /F1 24 Tf 25 1150 Td (Third page tall) Tj ET'),
    '<< /Type /Annot /Subtype /Link /Rect [25 490 250 530] /Border [0 0 1] /Dest [4 0 R /XYZ 0 400 0] >>',
  ];
  let out = '%PDF-1.7\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

async function epubFixture(fixed = false) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OPS/book.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">float-reader-${fixed ? 'fixed' : 'flow'}</dc:identifier><dc:title>Test publication</dc:title><dc:language>en</dc:language>${fixed ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}</metadata><manifest><item id="c1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    'OPS/nav.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Opening chapter</a></li><li><a href="two.xhtml">Second chapter</a></li></ol></nav></body></html>',
  };
  for (const [index, name] of ['one', 'two'].entries()) files[`OPS/${name}.xhtml`] = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${index + 1}</title>${fixed ? '<meta name="viewport" content="width=800,height=1000"/>' : ''}<style>body { color: #181818; background: white; } h1 { color: #48298a; }</style></head><body><h1>${index ? 'Second chapter' : 'Opening chapter'}</h1><a href="${index ? 'one' : 'two'}.xhtml#note">Jump to other chapter</a><p id="note">The footnote destination.</p>${Array.from({ length: fixed ? 2 : 80 }, (_, n) => `<p>Passage ${n + 1}: The reader keeps a stable place beside your work. This paragraph supplies natural flowing text across several displayed pages.</p>`).join('')}<img src="https://should-never-fetch.invalid/tracker.png"/><script>parent.document.body.dataset.compromised='yes'; fetch('https://should-never-fetch.invalid/script');</script></body></html>`;
  for (const [name, text] of Object.entries(files)) await writer.add(name, new TextReader(text), { level: name === 'mimetype' ? 0 : 6, lastModDate: new Date('2026-01-01T00:00:00Z'), extendedTimestamp: false });
  return Buffer.from(await writer.close());
}

test('PDF paints text and mixed page geometry, uses physical labels and internal link/back', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const buffer = pdfFixture(); await recordFixture('mixed-pages.pdf', buffer, { pages: 3, textLayer: true, pageLabels: 'Roman', geometry: 'mixed' });
  await page.locator('#file-input').setInputFiles({ name: 'mixed-pages.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('#filename')).toHaveText('mixed-pages.pdf');
  await expect(page.locator('#position')).toContainText('Page 1 of 3');
  await expect(page.locator('#position')).toContainText('i');
  await expect(page.locator('.textLayer')).toContainText('First page with selectable text');
  expect(await page.locator('.pdf-page canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.height > canvas.width)).toBe(true);
  await page.screenshot({ path: 'test-results/reader-pdf.png' });
  await page.locator('.pdf-link').click();
  await expect(page.locator('#position')).toContainText('Page 2 of 3');
  await expect(page.locator('.textLayer')).toContainText('Second page landscape');
  await page.locator('.reader-host').focus(); await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#position')).toContainText('Page 1 of 3');
  await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
  await expect(page.locator('#position')).toContainText('Page 3 of 3');
  await expect(page.locator('.textLayer')).toContainText('Third page tall');
  await page.keyboard.press('Control+2');
  await expect.poll(() => page.locator('.reader-host').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('#position')).toContainText('Page 3 of 3');
  await expect.poll(() => page.locator('.reader-host').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('PDF loading does not change scroll geometry or repeatedly refit an idle page', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 620 });
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({ name: 'loading-layout.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
  await expect(page.locator('#position')).toContainText('Page 1 of 3');
  const host = page.locator('.pdf-reader');
  await host.focus();

  for (const scrolled of [false, true]) {
    if (scrolled) {
      await page.keyboard.press('Control+2');
      await expect(page.locator('.pdf-render-status')).toHaveCount(0);
      await page.keyboard.press('Space');
      await expect.poll(() => host.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    }
    await host.evaluate(el => {
      delete (el as HTMLElement).dataset.loadingGeometry;
      const before = [el.clientWidth, el.clientHeight, el.scrollWidth, el.scrollHeight, el.scrollLeft, el.scrollTop];
      const observer = new MutationObserver(() => {
        const status = el.querySelector('.pdf-render-status');
        if (!status) return;
        const box = status.getBoundingClientRect(), viewport = el.getBoundingClientRect();
        observer.disconnect();
        (el as HTMLElement).dataset.loadingGeometry = JSON.stringify({ before, during: [el.clientWidth, el.clientHeight, el.scrollWidth, el.scrollHeight, el.scrollLeft, el.scrollTop], visible: box.top >= viewport.top && box.bottom <= viewport.bottom && box.left >= viewport.left && box.right <= viewport.right });
      });
      observer.observe(el, { childList: true });
    });
    // Reapply the current fit mode, as a resize refresh does.
    await page.keyboard.press(scrolled ? 'Control+2' : 'Control+0');
    await expect(host).toHaveAttribute('data-loading-geometry', /.+/);
    const geometry = JSON.parse((await host.getAttribute('data-loading-geometry'))!);
    expect(geometry.during).toEqual(geometry.before);
    expect(geometry.visible).toBe(true);
    await expect(page.locator('.pdf-render-status')).toHaveCount(0);
    const canvas = await page.locator('.pdf-page canvas').elementHandle();
    await page.waitForTimeout(450); // Several 100 ms resize-debounce periods must remain idle.
    expect(await canvas!.evaluate(el => el.isConnected)).toBe(true);
    await expect(page.locator('#position')).toContainText('Page 1 of 3');
  }
});

test('reflowable EPUB renders real chapters, blocks scripts/network, and follows links/back', async ({ page }) => {
  const remote: string[] = [], errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (req.url().includes('should-never-fetch')) remote.push(req.url()); });
  await page.goto('/');
  const buffer = await epubFixture(); await recordFixture('flow.epub', buffer, { chapters: 2, layout: 'reflowable', hostileContent: ['script', 'external image'] });
  const file = { name: 'flow.epub', mimeType: 'application/epub+zip', buffer };
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#filename')).toHaveText('flow.epub');
  await expect(page.locator('#position')).toContainText('Opening chapter');
  const content = () => page.frames().find(frame => frame.url().startsWith('blob:'))!;
  await expect.poll(() => !!content()).toBe(true);
  await expect(content().locator('h1')).toHaveText('Opening chapter');
  await page.screenshot({ path: 'test-results/reader-epub.png' });
  expect(await content().evaluate(() => window.frameElement?.getAttribute('sandbox'))).toBe('allow-same-origin');
  expect(await page.locator('body').getAttribute('data-compromised')).toBeNull();
  await content().getByRole('link', { name: 'Jump to other chapter' }).click();
  await expect(page.locator('#position')).toContainText('Second chapter');
  await page.locator('.reader-host').focus(); await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#position')).toContainText('Opening chapter');
  await page.keyboard.press('Control+g'); await page.locator('#target').fill('70%'); await page.getByRole('button', { name: 'Go to location', exact: true }).click();
  await expect(page.locator('#position')).toContainText('Second chapter');
  await page.setViewportSize({ width: 760, height: 900 });
  await expect(page.locator('#position')).toContainText('Second chapter');
  await page.locator('.reader-host').focus(); await page.keyboard.press('Control+Equal');
  await expect(page.locator('#position')).toContainText('Second chapter');
  await expect.poll(async () => Number(await page.locator('#progress').getAttribute('aria-valuenow'))).toBeGreaterThan(60);
  await page.waitForTimeout(900); // Wait for the public settled-position persistence contract.
  const before = Number(await page.locator('#progress').getAttribute('aria-valuenow'));
  await page.reload(); await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#position')).toContainText('Second chapter');
  const after = Number(await page.locator('#progress').getAttribute('aria-valuenow'));
  expect(Math.abs(before - after)).toBeLessThan(5);
  expect(remote).toEqual([]); expect(errors).toEqual([]);
});

test('fixed-layout EPUB keeps physical single pages and supports next/fit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const buffer = await epubFixture(true); await recordFixture('fixed.epub', buffer, { pages: 2, layout: 'pre-paginated', viewport: '800 x 1000' });
  await page.locator('#file-input').setInputFiles({ name: 'fixed.epub', mimeType: 'application/epub+zip', buffer });
  await expect(page.locator('#filename')).toHaveText('fixed.epub');
  await expect(page.locator('#filekind')).toContainText('Page view');
  await expect(page.locator('#position')).toContainText('Page 1 of 2');
  const first = page.frames().find(frame => frame.url().startsWith('blob:'))!;
  await expect(first.locator('h1')).toHaveText('Opening chapter');
  expect(await first.evaluate(() => window.frameElement?.getAttribute('sandbox'))).toBe('allow-same-origin');
  await page.keyboard.press('PageDown');
  await expect(page.locator('#position')).toContainText('Page 2 of 2');
  await page.keyboard.press('Control+2');
  expect(errors).toEqual([]);
});
