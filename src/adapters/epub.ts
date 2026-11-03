import { BlobReader, ZipReader, configure, type FileEntry } from '@zip.js/zip.js';
import { EPUB } from 'foliate-js/epub.js';
import 'foliate-js/view.js';
import type { Locator, OutlineItem, Position, ReaderAdapter, ReaderContext, ReaderOptions, ReaderSource } from '../types';
import { isDark, liftInk, onAppearanceChange, parseRgb, readingColors, rgbToHex, type Rgb } from '../theme';

const RESOURCE_LIMIT = 64 * 1024 * 1024;
const ARCHIVE_LIMIT = 512 * 1024 * 1024;
const XHTML = 'http://www.w3.org/1999/xhtml';
const CONTENT_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src blob: data:; font-src blob: data:; style-src 'unsafe-inline' blob:; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

type Section = { id: string; size: number; linear?: string; createDocument: () => Promise<Document>; unload: () => void };
type FoliateBook = { sections: Section[]; rendition: { layout?: string; spread?: string }; toc?: TocNode[]; transformTarget: EventTarget; destroy: () => void };
type TocNode = { label: string; href: string; subitems?: TocNode[] };
type Target = { index: number; anchor?: number | ((doc: Document) => Range | Element | number) };
type FoliateView = HTMLElement & {
  open: (book: FoliateBook) => Promise<void>; close: () => void;
  prev: () => Promise<void>; next: () => Promise<void>;
  getCFI: (index: number, range?: Range) => string;
  resolveNavigation: (target: string | number) => Target | undefined;
  renderer: HTMLElement & {
    index?: number; goTo: (target: Target) => Promise<void>; setStyles?: (styles: string) => void;
    getContents: () => { doc: Document; index?: number }[];
  };
};

export function validArchivePath(path: string): boolean {
  return !!path && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && !path.includes(':') && !path.split('/').includes('..');
}

/** Runs on detached markup before any document can enter an iframe. */
export function sanitizeEpubMarkup(markup: string, mime = 'application/xhtml+xml', rewritten = false): string {
  const doc = new DOMParser().parseFromString(markup, mime as DOMParserSupportedType);
  if (doc.querySelector('parsererror')) throw new Error('The EPUB contains malformed markup.');
  for (const node of Array.from(doc.childNodes)) if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE || node.nodeType === Node.DOCUMENT_TYPE_NODE) node.remove();
  for (const element of Array.from(doc.querySelectorAll('*'))) {
    const tag = element.localName.toLowerCase();
    if (['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'base', 'form', 'input', 'button', 'textarea', 'select', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set'].includes(tag)) { element.remove(); continue; }
    if (['audio', 'video'].includes(tag)) {
      const placeholder = doc.createElementNS(XHTML, 'p'); placeholder.textContent = 'Embedded audio/video is unavailable in this reader.'; element.replaceWith(placeholder); continue;
    }
    if (tag === 'meta' && element.getAttribute('name')?.toLowerCase() !== 'viewport') { element.remove(); continue; }
    if (tag === 'link' && element.getAttribute('rel')?.toLowerCase() !== 'stylesheet') { element.remove(); continue; }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.localName.toLowerCase(), value = attr.value.trim();
      if (name.startsWith('on') || ['srcdoc', 'srcset', 'ping', 'action', 'formaction', 'target', 'download', 'autofocus'].includes(name)) { element.removeAttributeNode(attr); continue; }
      if (['href', 'src', 'poster', 'data', 'background'].includes(name)) {
        const anchor = tag === 'a' && name === 'href';
        const safe = anchor
          ? /^(https?:\/\/|#)/i.test(value) || (!/^[a-z][\w+.-]*:|^\/\//i.test(value) && !value.includes('\\'))
          : rewritten ? /^(blob:|data:image\/(?:png|jpeg|gif|webp|avif);|#)/i.test(value)
            : !/^[a-z][\w+.-]*:|^\/\//i.test(value) || /^data:image\/(?:png|jpeg|gif|webp|avif);/i.test(value);
        if (!safe) { element.removeAttributeNode(attr); if (tag === 'img') element.setAttribute('alt', 'Unavailable image (external or unsupported resource)'); }
      }
    }
  }
  if (doc.documentElement.localName === 'html') {
    const head = doc.querySelector('head') ?? doc.documentElement.insertBefore(doc.createElementNS(XHTML, 'head'), doc.documentElement.firstChild);
    const csp = doc.createElementNS(XHTML, 'meta'); csp.setAttribute('http-equiv', 'Content-Security-Policy'); csp.setAttribute('content', CONTENT_CSP); head.prepend(csp);
  }
  return new XMLSerializer().serializeToString(doc);
}

const weight = (root: Node): number => (root.textContent?.length ?? 0) + (root instanceof Element || root instanceof DocumentFragment ? root.querySelectorAll('img,svg').length * 1000 : 0);
function offsetOfRange(doc: Document, range?: Range) {
  if (!range) return 0;
  const before = doc.createRange(); before.selectNodeContents(doc.body ?? doc.documentElement);
  try { before.setEnd(range.startContainer, range.startOffset); return weight(before.cloneContents()); } catch { return 0; }
}
function rangeAtOffset(doc: Document, offset: number) {
  const root = doc.body ?? doc.documentElement;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let remaining = Math.max(0, offset);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const n = node.nodeType === Node.TEXT_NODE ? node.textContent!.length : /^(img|svg)$/i.test((node as Element).localName) ? 1000 : 0;
    if (n && remaining <= n) {
      const range = doc.createRange();
      if (node.nodeType === Node.TEXT_NODE) range.setStart(node, Math.min(remaining, n)); else range.setStartBefore(node);
      range.collapse(true); return range;
    }
    remaining -= n;
  }
  const range = doc.createRange(); range.selectNodeContents(root); range.collapse(false); return range;
}

export class EpubAdapter implements ReaderAdapter {
  mode: 'fixed' | 'paginated' = 'paginated';
  private host!: HTMLElement;
  private context!: ReaderContext;
  private options!: ReaderOptions;
  private view?: FoliateView;
  private book?: FoliateBook;
  private archive?: ZipReader<Blob>;
  private disposed = false;
  private queue = Promise.resolve();
  private abort = new AbortController();
  private history: Locator[] = [];
  private items: OutlineItem[] = [];
  private weights: number[] = [];
  /** Running sum of spine weights; scroll/relocate fires on every frame, so O(n) sums are not viable. */
  private weightPrefix: number[] = [0];
  private totalWeight = 0;
  private activeIndex = 0;
  private lastFixedIndex = -1;
  private chapter = '';
  private position: Position = { label: 'Opening EPUB…', fraction: 0, locator: { kind: 'epub' }, scrub: { current: 0, total: 100, unit: 'percent' } };
  private explicitEnd = false;
  private unsubscribe?: () => void;
  /** Inline colors replaced to keep publication text legible on a dark page, restored on light pages. */
  private lifted = new WeakMap<Document, [element: HTMLElement, value: string, priority: string][]>();

  async open(source: ReaderSource, host: HTMLElement, context: ReaderContext, options: ReaderOptions) {
    this.host = host; this.context = context; this.options = { ...options };
    host.tabIndex = 0; host.setAttribute('aria-label', 'EPUB reading surface');
    host.style.overflow = 'hidden';
    configure({ useWebWorkers: false });
    const archive = this.archive = new ZipReader(new BlobReader(new Blob([source.bytes.slice()])), { useWebWorkers: false });
    let size = 0, count = 0; const map = new Map<string, FileEntry>();
    for await (const entry of archive.getEntriesGenerator()) {
      if (++count > 10_000) throw new Error('This EPUB contains too many archive entries (limit 10,000).');
      if (!validArchivePath(entry.filename)) throw new Error('The EPUB contains an unsafe archive path.');
      if (entry.directory) continue;
      if (entry.encrypted) throw new Error('Encrypted/DRM-protected EPUB files are not supported.');
      if (entry.uncompressedSize > RESOURCE_LIMIT) throw new Error('An EPUB resource exceeds the 64 MiB limit.');
      size += entry.uncompressedSize;
      if (size > ARCHIVE_LIMIT) throw new Error('The expanded EPUB exceeds the 512 MiB limit.');
      if (map.has(entry.filename)) throw new Error('The EPUB contains duplicate archive entries.');
      map.set(entry.filename, entry as FileEntry);
    }
    const read = async (name: string, type = ''): Promise<Blob | null> => {
      if (!validArchivePath(name)) throw new Error('The EPUB requested a resource outside its archive.');
      if (this.disposed) throw new DOMException('Opening cancelled', 'AbortError');
      const entry = map.get(name); if (!entry) return null;
      let length = 0; const chunks: Uint8Array<ArrayBuffer>[] = [];
      await entry.getData(new WritableStream<Uint8Array>({ write(chunk) {
        length += chunk.byteLength;
        if (length > RESOURCE_LIMIT) throw new Error('An expanded EPUB resource exceeds the 64 MiB limit.');
        chunks.push(chunk.slice());
      } }), { signal: this.abort.signal, checkSignature: true });
      return new Blob(chunks, { type });
    };
    const loadText = async (name: string): Promise<string | null> => {
      const blob = await read(name); if (!blob) return null;
      const text = await blob.text();
      if (/\.(xhtml|html|htm|svg)$/i.test(name)) return sanitizeEpubMarkup(text, /\.svg$/i.test(name) ? 'image/svg+xml' : /\.(html|htm)$/i.test(name) ? 'text/html' : 'application/xhtml+xml');
      return text;
    };
    const encryption = await loadText('META-INF/encryption.xml');
    if (encryption) {
      const doc = new DOMParser().parseFromString(encryption, 'application/xml');
      const allowed = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);
      if (Array.from(doc.getElementsByTagNameNS('*', 'EncryptionMethod')).some(el => !allowed.has(el.getAttribute('Algorithm') ?? '')))
        throw new Error('DRM-protected EPUB files are not supported. Open a DRM-free copy.');
    }
    this.book = await new EPUB({ loadText, loadBlob: read, getSize: (name: string) => map.get(name)?.uncompressedSize ?? 0 }).init() as FoliateBook;
    if (!this.book.sections.length) throw new Error('The EPUB has no readable spine sections.');
    this.mode = this.book.rendition?.layout === 'pre-paginated' ? 'fixed' : 'paginated';
    this.book.rendition ??= {}; this.book.rendition.spread = 'none';
    // Reflowable text follows the reading theme; fixed-layout pages stay faithful.
    if (this.mode === 'paginated') host.classList.add('reflow-reader');
    this.book.transformTarget.addEventListener('data', event => {
      const detail = (event as CustomEvent).detail;
      if (['application/xhtml+xml', 'text/html', 'image/svg+xml'].includes(detail.type))
        detail.data = Promise.resolve(detail.data).then(data => sanitizeEpubMarkup(String(data), detail.type, true));
    });
    const flatten = (nodes: TocNode[]) => { for (const item of nodes) { if (item.href) this.items.push({ label: item.label, target: item.href }); flatten(item.subitems ?? []); } };
    flatten(this.book.toc ?? []);
    // The map is based on content, never displayed page counts or equal chapter weights.
    for (const section of this.book.sections) {
      if (this.disposed) throw new DOMException('Opening cancelled', 'AbortError');
      const doc = await section.createDocument();
      this.weights.push(Math.max(1, weight(doc.body ?? doc.documentElement)));
    }
    this.weightPrefix = [0];
    for (const section of this.weights) this.weightPrefix.push(this.weightPrefix[this.weightPrefix.length - 1] + section);
    this.totalWeight = this.weightPrefix[this.weightPrefix.length - 1];
    const view = this.view = document.createElement('foliate-view') as FoliateView;
    Object.assign(view.style, { display: 'block', width: '100%', height: '100%' }); host.append(view);
    view.addEventListener('relocate', event => {
      if (this.disposed) return;
      const detail = (event as CustomEvent).detail;
      this.activeIndex = detail.section?.current ?? view.renderer.index ?? this.activeIndex;
      this.chapter = detail.tocItem?.label ?? `Chapter ${this.activeIndex + 1}`;
      const doc = detail.range?.startContainer?.ownerDocument;
      const offset = doc ? offsetOfRange(doc, detail.range) : 0;
      this.updatePosition(offset, detail.cfi);
      if (this.mode === 'fixed' && this.lastFixedIndex !== this.activeIndex) {
        if (this.lastFixedIndex >= 0) this.book?.sections[this.lastFixedIndex]?.unload();
        this.lastFixedIndex = this.activeIndex;
      }
    });
    view.addEventListener('external-link', event => { event.preventDefault(); const href = (event as CustomEvent).detail.href;
      if (/^https?:\/\//i.test(href)) void context.openExternal(href).catch(context.onError);
    });
    view.addEventListener('link', event => { event.preventDefault(); void this.goTo((event as CustomEvent).detail.href).catch(context.onError); });
    view.addEventListener('load', event => {
      const doc: Document = (event as CustomEvent).detail.doc;
      // The postinstall patch applies this before src is assigned; assert defense too.
      const frame = doc.defaultView?.frameElement;
      if (!frame || frame.getAttribute('sandbox') !== 'allow-same-origin') throw new Error('Unsafe EPUB frame sandbox. Reinstall the application.');
      if (this.mode === 'fixed') context.onFrame?.(doc);
      doc.addEventListener('keydown', event => {
        const target = event.target as Element;
        if (target.closest('input,textarea,select,[contenteditable="true"]')) return;
        // iframe events do not bubble to the application document.
        const forwarded = new KeyboardEvent('keydown', { key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey, bubbles: true, cancelable: true, repeat: event.repeat });
        if (!host.dispatchEvent(forwarded)) event.preventDefault();
      });
      if (this.mode === 'paginated') this.adaptInk(doc);
    });
    await view.open(this.book);
    // Foliate centres fixed-layout pages with plain flex centring, which pushes the left/top of a
    // zoomed page into negative overflow that no scroll (or hand-tool pan) can reach.
    if (this.mode === 'fixed') Object.assign(view.renderer.style, { justifyContent: 'safe center', alignItems: 'safe center' });
    this.applyOptions();
    if (this.mode === 'paginated') this.unsubscribe = onAppearanceChange(() => {
      this.applyOptions();
      for (const { doc } of view.renderer.getContents()) this.adaptInk(doc);
    });
    await view.renderer.goTo({ index: 0 });
    if (this.mode === 'fixed') view.renderer.addEventListener('scroll', () => {
      if (view.renderer.scrollTop < view.renderer.scrollHeight - view.renderer.clientHeight - 2) this.explicitEnd = false;
      this.updatePosition(0);
    }, { passive: true });
  }

  private updatePosition(offset: number, cfi?: string) {
    if (!this.book || !this.view || this.disposed) return;
    const index = this.activeIndex, total = this.book.sections.length;
    const renderer = this.view.renderer;
    const within = this.mode === 'fixed' ? clamp(renderer.scrollTop / Math.max(1, renderer.scrollHeight)) : clamp(offset / this.weights[index]);
    const fraction = this.explicitEnd ? 1 : this.mode === 'fixed' ? (index + within) / total
      : clamp((this.weightPrefix[index] + offset) / this.totalWeight);
    this.position = { label: this.mode === 'fixed' ? `Page ${index + 1} of ${total}` : `${this.chapter || `Chapter ${index + 1}`} · ≈${Math.round(fraction * 100)}%`, fraction,
      scrub: this.mode === 'fixed' ? { current: index + 1, total, unit: 'page' } : { current: fraction * 100, total: 100, unit: 'percent' },
      locator: { kind: 'epub', spine: this.book.sections[index]?.id, index, cfi: cfi ?? this.position.locator.cfi, offset, fraction, within, end: this.explicitEnd } };
    this.context.onPosition(this.position);
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => {
      if (this.disposed) return;
      this.host.setAttribute('aria-busy', 'true');
      try { await work(); } finally { this.host.removeAttribute('aria-busy'); }
    });
    this.queue = next.catch(() => {}); return next;
  }
  private remember() { this.history.push({ ...this.position.locator }); if (this.history.length > 20) this.history.shift(); }
  private async target(target: string | number) {
    const resolved = this.view?.resolveNavigation(target);
    if (!resolved || resolved.index < 0 || resolved.index >= (this.book?.sections.length ?? 0)) throw new Error('This chapter or link is not in the EPUB spine.');
    await this.view!.renderer.goTo(resolved);
  }
  async navigate(action: Parameters<ReaderAdapter['navigate']>[0]) {
    return this.enqueue(async () => {
      if (!this.view || !this.book) return;
      if (action === 'back') { const old = this.history.pop(); if (old) await this.restoreNow(old); return; }
      this.explicitEnd = action === 'end';
      if (action === 'start' || action === 'end') {
        this.remember(); await this.view.renderer.goTo({ index: action === 'start' ? 0 : this.book.sections.length - 1, anchor: action === 'end' ? 1 : 0 });
        if (this.mode === 'fixed' && action === 'end') this.view.renderer.scrollTop = this.view.renderer.scrollHeight;
        this.updatePosition(action === 'end' ? this.weights.at(-1)! : 0); return;
      }
      const forward = action === 'next' || action === 'screen-next';
      if (this.mode === 'fixed' && action.startsWith('screen-')) {
        const element = this.view.renderer, max = element.scrollHeight - element.clientHeight;
        if ((forward && element.scrollTop < max - 2) || (!forward && element.scrollTop > 2)) { element.scrollTop = Math.max(0, Math.min(max, element.scrollTop + (forward ? 1 : -1) * element.clientHeight * .9)); this.updatePosition(0); return; }
      }
      if (forward) await this.view.next(); else await this.view.prev();
    });
  }
  async goTo(target: string) {
    return this.enqueue(async () => {
      const percent = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(target);
      if (percent && this.mode === 'paginated') {
        const fraction = Number(percent[1]) / 100;
        if (fraction < 0 || fraction > 1) throw new Error('Enter a percentage from 0% to 100%.');
        this.remember(); this.explicitEnd = fraction === 1;
        let offset = fraction * this.totalWeight, index = 0;
        while (index < this.weights.length - 1 && offset >= this.weights[index]) offset -= this.weights[index++];
        const wanted = Math.floor(offset);
        await this.view!.renderer.goTo({ index, anchor: doc => rangeAtOffset(doc, wanted) }); return;
      }
      if (/^\d+$/.test(target)) {
        const index = Number(target) - 1;
        if (index < 0 || index >= (this.book?.sections.length ?? 0)) throw new Error(`Enter a ${this.mode === 'fixed' ? 'page' : 'chapter'} from 1 to ${this.book?.sections.length}.`);
        this.remember(); this.explicitEnd = false; await this.target(index); return;
      }
      this.remember(); this.explicitEnd = false; await this.target(target);
    });
  }
  getPosition() { return this.position; }
  private async restoreNow(locator: Locator) {
    if (locator.kind !== 'epub' || !this.book || !this.view) return;
    this.explicitEnd = locator.end === true;
    let index = this.book.sections.findIndex(section => section.id === locator.spine);
    if (index < 0) index = Math.max(0, Math.min(this.book.sections.length - 1, Number(locator.index) || 0));
    if (typeof locator.cfi === 'string' && this.mode !== 'fixed') {
      const resolved = this.view.resolveNavigation(locator.cfi);
      if (resolved && resolved.index === index) { await this.view.renderer.goTo(resolved); return; }
    }
    await this.view.renderer.goTo({ index, anchor: doc => rangeAtOffset(doc, Number(locator.offset) || 0) });
    if (this.mode === 'fixed') { this.view.renderer.scrollTop = clamp(Number(locator.within)) * this.view.renderer.scrollHeight; this.updatePosition(0); }
  }
  async restore(locator: Locator) { return this.enqueue(() => this.restoreNow(locator)); }
  private applyOptions() {
    if (!this.view) return;
    const renderer = this.view.renderer, options = this.options;
    if (this.mode === 'fixed') renderer.setAttribute('zoom', options.zoom === 1 ? `fit-${options.fit}` : String(options.zoom));
    else {
      renderer.setAttribute('flow', 'paginated'); renderer.setAttribute('max-column-count', '1');
      renderer.setAttribute('margin', `${options.margin}px`); renderer.setAttribute('gap', `${Math.max(2, options.margin / Math.max(1, this.host.clientWidth) * 200)}%`);
      // The frame's color-scheme must match the app's or Chromium paints it opaque; Foliate paints --theme-bg-color behind each column.
      const { scheme, ink, paper, accent } = readingColors();
      renderer.setStyles?.(`html { color-scheme: ${scheme}; color: ${rgbToHex(ink)}; --theme-bg-color: ${rgbToHex(paper)}; } html, body { font-size: ${options.fontSize}px !important; line-height: ${options.lineHeight} !important; } img, svg { max-width: 100%; } a:focus-visible { outline: 2px solid ${rgbToHex(accent)}; }`);
    }
  }
  /** Dark pages keep publication colors but lift text that would be illegible on them; light pages get the originals back. */
  private adaptInk(doc: Document) {
    for (const [element, value, priority] of this.lifted.get(doc) ?? []) element.style.setProperty('color', value, priority);
    this.lifted.delete(doc);
    const { paper, ink } = readingColors(), view = doc.defaultView, body = doc.body;
    if (!view || !body || !isDark(paper)) return;
    const changed: [HTMLElement, string, string][] = [], backgrounds = new Map<Node, Rgb>();
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, { acceptNode: node => (node as Element).namespaceURI === XHTML ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let node: Node | null = body; node; node = walker.nextNode()) {
      const element = node as HTMLElement, style = view.getComputedStyle(element);
      // Foliate moves the body background behind the frame, where --theme-bg-color replaces it.
      const background = (element !== body && parseRgb(style.backgroundColor)) || (element.parentNode && backgrounds.get(element.parentNode)) || paper;
      backgrounds.set(element, background);
      if (!Array.from(element.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) continue;
      const color = parseRgb(style.color), legible = color && liftInk(color, background, ink);
      if (!legible) continue;
      changed.push([element, element.style.getPropertyValue('color'), element.style.getPropertyPriority('color')]);
      element.style.setProperty('color', rgbToHex(legible), 'important');
    }
    if (changed.length) this.lifted.set(doc, changed);
  }
  async setOptions(options: ReaderOptions) {
    return this.enqueue(async () => { const old = { ...this.position.locator }; this.options = { ...options }; this.applyOptions();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); await this.restoreNow(old);
    });
  }
  outline() { return this.items; }
  /** Fixed-layout pages scroll inside Foliate's renderer when zoomed; reflowable chapters paginate and never pan. */
  scroller() { return this.mode === 'fixed' ? this.view?.renderer : undefined; }
  destroy() {
    this.disposed = true; this.abort.abort(); this.unsubscribe?.();
    try { this.view?.close(); } catch { /* An opening cancellation may precede Foliate's first page. */ }
    this.view?.remove(); this.book?.destroy(); void this.archive?.close(); this.view = undefined; this.book = undefined;
    this.host?.classList.remove('reflow-reader');
  }
}
