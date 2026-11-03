// Deterministic synthetic fixtures for the performance harness. No binary media is
// committed: every fixture is generated from source so runs are byte-comparable.

/** Minimal but valid text PDF with a Helvetica text layer on every page. */
export function textPdf({ pages = 120, wordsPerLine = 9, lines = 42, mediaBox = [0, 0, 612, 792] } = {}) {
  const [x, y, w, h] = mediaBox;
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // Reserve the catalog and page-tree slots first so every object number is known up front;
  // PDF.js validates the /Pages tree and rejects forward or mistyped references.
  const catalog = add('');
  const pagesId = add('');
  const pageIds = [];
  for (let page = 0; page < pages; page++) {
    const ops = ['BT', `/F1 11 Tf`, `14 TL`, `${x + 48} ${y + h - 64} Td`];
    for (let line = 0; line < lines; line++) {
      const text = Array.from({ length: wordsPerLine }, (_, word) =>
        `p${page + 1}w${line + 1}x${word + 1}`).join(' ').replace(/[()\\]/g, '');
      ops.push(`(${text}) Tj`, 'T*');
    }
    ops.push('ET');
    const stream = ops.join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [${x} ${y} ${w} ${h}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
    pageIds.push(objects.length);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  let out = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(out)); out += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

/** Plain-text fixture with a known byte size (the PRD stress class is a 50 MiB TXT). */
export function plainText({ megabytes = 1 } = {}) {
  const target = megabytes * 1024 * 1024;
  const line = 'Line NUMBER: a representative sentence with Unicode 🦋 and enough words to wrap in a narrow reader window.\n';
  const parts = [];
  let size = 0, index = 0;
  while (size < target) { const next = line.replace('NUMBER', String(++index)); parts.push(next); size += Buffer.byteLength(next); }
  return Buffer.from(parts.join(''), 'utf8');
}

/** Markdown fixture with headings (outline), tables, fenced code and long paragraphs. */
export function markdown({ sections = 60 } = {}) {
  const parts = [];
  for (let section = 1; section <= sections; section++) {
    parts.push(`## Section ${section}\n`);
    parts.push(`${'A representative paragraph with **bold** and *italic* text. '.repeat(30)}\n`);
    if (section % 5 === 0) {
      parts.push('| Column | Value | Notes |\n| --- | --- | --- |\n');
      for (let row = 0; row < 12; row++) parts.push(`| row ${row} | ${row * 7} | a table cell with text |\n`);
    }
    if (section % 7 === 0) parts.push('```js\n' + 'const value = compute(1, 2, 3);\n'.repeat(25) + '```\n');
  }
  return Buffer.from(parts.join('\n'), 'utf8');
}

/** Stores a fixture ZIP (EPUB) from a list of [name, string|Buffer] entries. */
export function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBytes]));
    locals.push(Buffer.concat([local, nameBytes, body]));
    offset += local.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Reflowable EPUB with a content.opf, nav and one XHTML chapter per section. */
export function reflowableEpub({ sections = 30 } = {}) {
  const chapters = [];
  for (let index = 1; index <= sections; index++) {
    const paragraphs = Array.from({ length: 12 }, (_, p) => `<p>${`Chapter ${index} paragraph ${p + 1}. `.concat('Representative reading text that must paginate correctly. '.repeat(14))}</p>`).join('\n');
    chapters.push([`OEBPS/text/chapter-${index}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${index}</title></head><body><h1 id="c${index}">Chapter ${index}</h1>${paragraphs}</body></html>`]);
  }
  const manifest = chapters.map((_, i) => `<item id="c${i + 1}" href="text/chapter-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:perf-fixture</dc:identifier><dc:title>Perf Fixture</dc:title><dc:language>en</dc:language></metadata><manifest>${manifest}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>${spine}</spine></package>`],
    ['OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${chapters.map((_, i) => `<li><a href="text/chapter-${i + 1}.xhtml">Chapter ${i + 1}</a></li>`).join('')}</ol></nav></body></html>`],
    ...chapters,
  ]);
}

let table = null;
function crc32(buffer) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
