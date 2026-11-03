import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import './pdf.css';
import type { Locator, OutlineItem, Position, ReaderAdapter, ReaderContext, ReaderOptions, ReaderSource } from '../types';

GlobalWorkerOptions.workerSrc = workerURL;
/** Bound on decoded page bitmaps kept for instant page turns (bytes of canvas backing store). */
const PAGE_CACHE_BYTES = 32 * 1024 * 1024;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export class PdfAdapter implements ReaderAdapter {
  readonly mode = 'fixed' as const;
  private doc?: PDFDocumentProxy;
  private loading?: ReturnType<typeof getDocument>;
  private host!: HTMLElement;
  private context!: ReaderContext;
  private options!: ReaderOptions;
  private page = 1;
  private requested = 1;
  private labels: string[] | null = null;
  private items: OutlineItem[] = [];
  private destinations = new Map<string, unknown>();
  private history: Locator[] = [];
  private generation = 0;
  private disposed = false;
  private task?: RenderTask;
  private layer?: TextLayer;
  private currentPage?: PDFPageProxy;
  private surface?: HTMLElement;
  private status?: HTMLElement;
  private observer?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private pageCache = new Map<string, HTMLCanvasElement>();
  private prefetchAbort?: AbortController;
  private prefetching = false;
  private explicitEnd = false;
  private onScroll = () => { if (!this.host.hasAttribute('aria-busy')) {
    if (this.host.scrollTop < this.host.scrollHeight - this.host.clientHeight - 2) this.explicitEnd = false;
    this.report();
  } };

  async open(source: ReaderSource, host: HTMLElement, context: ReaderContext, options: ReaderOptions) {
    this.host = host; this.context = context; this.options = { ...options };
    host.classList.add('pdf-reader'); host.tabIndex = 0;
    host.setAttribute('aria-label', 'PDF reading surface');
    const root = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href).href;
    const loading = this.loading = getDocument({ data: source.bytes,
      cMapUrl: `${root}cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}standard_fonts/`, wasmUrl: `${root}wasm/`,
      enableXfa: false, maxImageSize: 40_000_000 });
    loading.onPassword = (update: (password: string) => void) => { void context.requestPassword().then(password => {
      if (password === null || this.disposed) void loading.destroy(); else update(password);
    }).catch(error => { context.onError(error); void loading.destroy(); }); };
    this.doc = await loading.promise;
    if (this.disposed) { await loading.destroy(); return; }
    this.labels = await this.doc.getPageLabels();
    const walk = (nodes: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>) => {
      for (const node of nodes ?? []) {
        if (node.dest) { const target = `outline:${this.items.length}`; this.destinations.set(target, node.dest); this.items.push({ label: node.title, target }); }
        walk(node.items);
      }
    };
    walk(await this.doc.getOutline());
    await this.render(1);
    host.addEventListener('scroll', this.onScroll, { passive: true });
    let size = `${host.clientWidth}:${host.clientHeight}`;
    this.observer = new ResizeObserver(() => {
      const next = `${host.clientWidth}:${host.clientHeight}`;
      if (size === next || !host.clientWidth || !host.clientHeight) return;
      size = next;
      clearTimeout(this.resizeTimer);
      // Read the current committed location when the resize settles. Capturing
      // it here can overwrite a newer page/link navigation during the delay.
      this.resizeTimer = setTimeout(() => {
        if (!this.disposed && !host.hasAttribute('aria-busy'))
          void this.restore(this.getPosition().locator).catch(context.onError);
      }, 100);
    });
    this.observer.observe(host);
  }

  private async render(pageNumber: number, y = 0, x = 0, atEnd = false) {
    const doc = this.doc;
    if (!doc || this.disposed) return;
    const generation = ++this.generation;
    this.requested = clamp(Math.trunc(pageNumber), 1, doc.numPages);
    const target = this.requested;
    this.task?.cancel(); this.layer?.cancel();
    this.status?.remove();
    const status = this.status = document.createElement('div');
    status.className = 'pdf-render-status'; status.setAttribute('role', 'status'); status.textContent = `Loading page ${target}…`;
    // Keep loading/retry UI out of page flow: a temporary scrollbar retriggers resize.
    status.style.top = `${this.host.scrollTop + 8}px`;
    status.style.left = `${this.host.scrollLeft + 8}px`;
    this.host.append(status); this.host.setAttribute('aria-busy', 'true');
    let page: PDFPageProxy | undefined;
    try {
      page = await doc.getPage(target);
      if (generation !== this.generation || this.disposed) return;
      const { viewport, scale, dpr, pixelsWidth, pixelsHeight, key } = this.layout(page, target);
      const surface = document.createElement('div'); surface.className = 'pdf-page';
      surface.style.width = `${viewport.width}px`; surface.style.height = `${viewport.height}px`;
      surface.style.setProperty('--scale-factor', String(scale));
      surface.style.setProperty('--total-scale-factor', String(scale));
      // A cached bitmap for a neighbouring page paints in the same frame as the turn:
      // no decode, no rasterization, just a blit into the new canvas.
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
      const cached = this.pageCache.get(key);
      canvas.width = pixelsWidth; canvas.height = pixelsHeight;
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      if (cached) canvas.getContext('2d')?.drawImage(cached, 0, 0);
      surface.append(canvas);
      const task = cached ? undefined
        : this.task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      void task?.promise.catch(() => {}); // Cancellation can occur while text extraction is still pending.
      // Show the page as soon as it has pixels. The text layer and links are layered on
      // afterwards: waiting for them would delay first content by a full frame budget.
      this.commit(surface, target, page, viewport, y, x, atEnd);
      const text = await page.getTextContent();
      if (generation !== this.generation || this.disposed) { task?.cancel(); return; }
      if (task) await task.promise;
      if (generation !== this.generation || this.disposed) return;
      // Only a completed raster may be reused: a cancelled task leaves a partially painted canvas.
      if (task) this.cachePage(key, canvas);
      const textContainer = document.createElement('div'); textContainer.className = 'textLayer';
      surface.append(textContainer);
      const layer = this.layer = new TextLayer({ textContentSource: text, container: textContainer, viewport });
      await layer.render();
      if (generation !== this.generation || this.disposed) return;
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype !== 'Link' || (!annotation.dest && !annotation.url)) continue;
        const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
        const link = document.createElement('a'); link.className = 'pdf-link'; link.href = '#';
        link.setAttribute('aria-label', annotation.url ? `Open ${annotation.url}` : 'Go to linked passage');
        Object.assign(link.style, { left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.abs(x2 - x1)}px`, height: `${Math.abs(y2 - y1)}px` });
        link.addEventListener('click', event => { event.preventDefault();
          if (annotation.dest) { this.pushHistory(); void this.followDestination(annotation.dest).catch(this.context.onError); }
          else if (/^https?:\/\//i.test(annotation.url)) void this.context.openExternal(annotation.url).catch(this.context.onError);
        }); surface.append(link);
      }
      if (generation !== this.generation || this.disposed) return;
      if (!text.items.length) {
        const note = document.createElement('p'); note.className = 'pdf-scan-note'; note.textContent = 'Image-only page. Text selection is unavailable.'; surface.append(note);
      }
      this.prefetchNeighbours(target);
    } catch (error) {
      if (generation !== this.generation || this.disposed || (error as Error).name === 'RenderingCancelledException') return;
      this.requested = this.page; this.host.removeAttribute('aria-busy');
      status.textContent = `Page ${target} could not be rendered. `;
      const retry = document.createElement('button'); retry.textContent = 'Retry'; retry.onclick = () => { void this.render(target, y, x).catch(this.context.onError); }; status.append(retry);
      throw error;
    }
  }
  /** Geometry and cache identity for one page at the current options and host size. */
  private layout(page: PDFPageProxy, number: number) {
    const rotation = ((page.rotate + this.options.rotation) % 360 + 360) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const width = Math.max(100, this.host.clientWidth - 32), height = Math.max(100, this.host.clientHeight - 32);
    const fit = this.options.fit === 'width' ? width / base.width : Math.min(width / base.width, height / base.height);
    const scale = fit * clamp(this.options.zoom, .25, 5);
    const viewport = page.getViewport({ scale, rotation });
    // Cap the backing store by device pixels actually displayed, not by a flat 2x.
    const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
    const pixelsWidth = Math.ceil(viewport.width * dpr), pixelsHeight = Math.ceil(viewport.height * dpr);
    // Rotation is part of the identity: 0° and 180° share pixel dimensions but not pixels.
    return { viewport, scale, dpr, pixelsWidth, pixelsHeight, key: `${number}:${rotation}:${pixelsWidth}x${pixelsHeight}` };
  }

  /** Puts a rendered page on screen and records the position it represents. */
  private commit(surface: HTMLElement, target: number, page: PDFPageProxy, viewport: { width: number; height: number }, y: number, x: number, atEnd: boolean) {
    const previous = this.currentPage;
    this.currentPage = page; this.page = target; this.surface = surface;
    this.host.replaceChildren(surface); this.host.removeAttribute('aria-busy');
    this.host.scrollTop = atEnd ? this.host.scrollHeight : clamp(y) * viewport.height;
    this.host.scrollLeft = clamp(x) * viewport.width;
    this.explicitEnd = atEnd;
    if (previous && previous !== page) previous.cleanup();
    this.report();
  }

  /** Keeps a bounded set of rendered bitmaps so the next/previous turn can blit instead of rasterize. */
  private cachePage(key: string, canvas: HTMLCanvasElement) {
    this.pageCache.delete(key);
    // A single displayed page at 2x is a few MB; the bound keeps the whole adapter well under
    // any per-document memory budget while still covering the pages a reader turns between.
    const bytes = (bitmap: HTMLCanvasElement) => bitmap.width * bitmap.height * 4;
    let total = Array.from(this.pageCache.values()).reduce((sum, bitmap) => sum + bytes(bitmap), 0);
    const cost = bytes(canvas);
    while (this.pageCache.size && total + cost > PAGE_CACHE_BYTES) {
      const oldest = this.pageCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const bitmap = this.pageCache.get(oldest);
      this.pageCache.delete(oldest);
      total -= bitmap ? bytes(bitmap) : 0;
    }
    if (cost > PAGE_CACHE_BYTES) return;
    this.pageCache.set(key, canvas);
  }

  /** Warms the immediate neighbours at idle so a held-down page key does not rasterize on demand. */
  private prefetchNeighbours(current: number) {
    const doc = this.doc;
    if (!doc || this.disposed || this.prefetching) return;
    this.prefetching = true;
    const controller = new AbortController();
    this.prefetchAbort?.abort();
    this.prefetchAbort = controller;
    void (async () => {
      try {
        for (const number of [current + 1, current - 1]) {
          if (number < 1 || number > doc.numPages || controller.signal.aborted || this.disposed) continue;
          const page = await doc.getPage(number);
          if (controller.signal.aborted || this.disposed) return;
          const { viewport, dpr, pixelsWidth, pixelsHeight, key } = this.layout(page, number);
          if (this.pageCache.has(key)) continue;
          const canvas = document.createElement('canvas');
          canvas.width = pixelsWidth; canvas.height = pixelsHeight;
          await page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] }).promise;
          if (controller.signal.aborted || this.disposed) return;
          this.cachePage(key, canvas);
        }
      } catch { /* Prefetch is an optimization; a failure must never surface to the reader. */ }
      finally { if (this.prefetchAbort === controller) this.prefetching = false; }
    })();
  }

  private pushHistory() { this.history.push(this.getPosition().locator); if (this.history.length > 20) this.history.shift(); }
  private report() { if (!this.disposed) this.context.onPosition(this.getPosition()); }
  async navigate(action: Parameters<ReaderAdapter['navigate']>[0]) {
    if (!this.doc) return;
    if (action === 'back') { const old = this.history.pop(); if (old) await this.restore(old); return; }
    if (action === 'start' || action === 'end') { this.pushHistory(); await this.render(action === 'start' ? 1 : this.doc.numPages, 0, 0, action === 'end'); return; }
    const forward = action === 'next' || action === 'screen-next';
    if (action.startsWith('screen-') && !this.host.hasAttribute('aria-busy')) {
      const max = this.host.scrollHeight - this.host.clientHeight;
      if ((forward && this.host.scrollTop < max - 2) || (!forward && this.host.scrollTop > 2)) {
        this.host.scrollTop = clamp(this.host.scrollTop + (forward ? 1 : -1) * this.host.clientHeight * .9, 0, max); this.report(); return;
      }
    }
    const target = clamp(this.requested + (forward ? 1 : -1), 1, this.doc.numPages);
    if (target !== this.requested) await this.render(target, forward ? 0 : action === 'screen-previous' ? 1 : 0);
  }
  async goTo(target: string) {
    if (this.destinations.has(target)) { this.pushHistory(); await this.followDestination(this.destinations.get(target)); return; }
    const page = Number(target);
    if (!/^\d+$/.test(target) || !Number.isInteger(page) || page < 1 || page > (this.doc?.numPages ?? 0)) throw new Error(`Enter a physical page from 1 to ${this.doc?.numPages ?? 0}.`);
    this.pushHistory(); await this.render(page);
  }
  private async followDestination(destination: unknown) {
    if (!this.doc) return;
    const dest = typeof destination === 'string' ? await this.doc.getDestination(destination) : destination;
    if (!Array.isArray(dest) || !dest.length) throw new Error('This PDF link has no valid destination.');
    const index = typeof dest[0] === 'number' ? dest[0] : await this.doc.getPageIndex(dest[0]);
    const page = await this.doc.getPage(index + 1);
    const view = page.getViewport({ scale: 1, rotation: page.rotate + this.options.rotation });
    let x = 0, y = 0;
    if (dest[1]?.name === 'XYZ' && typeof dest[3] === 'number') {
      const point = view.convertToViewportPoint(typeof dest[2] === 'number' ? dest[2] : 0, dest[3]); x = point[0] / view.width; y = point[1] / view.height;
    }
    await this.render(index + 1, y, x);
  }
  getPosition(): Position {
    const y = clamp(this.host?.scrollTop / (this.surface?.offsetHeight || 1));
    const x = clamp(this.host?.scrollLeft / (this.surface?.offsetWidth || 1));
    const printed = this.labels?.[this.page - 1];
    return { label: `Page ${this.page} of ${this.doc?.numPages ?? 1}${printed && printed !== String(this.page) ? ` · ${printed}` : ''}`,
      fraction: this.explicitEnd ? 1 : ((this.page - 1) + y) / (this.doc?.numPages ?? 1),
      scrub: { current: this.page, total: this.doc?.numPages ?? 1, unit: 'page' },
      locator: { kind: 'pdf', page: this.page, x, y, fit: this.options?.fit, zoom: this.options?.zoom, rotation: this.options?.rotation, end: this.explicitEnd } };
  }
  async restore(locator: Locator) { if (locator.kind === 'pdf') await this.render(Number(locator.page) || 1, Number(locator.y) || 0, Number(locator.x) || 0, locator.end === true); }
  async setOptions(options: ReaderOptions) { const old = this.getPosition().locator; this.options = { ...options }; await this.restore(old); }
  outline() { return this.items; }
  destroy() {
    this.disposed = true; ++this.generation; this.task?.cancel(); this.layer?.cancel(); this.observer?.disconnect(); clearTimeout(this.resizeTimer);
    this.host?.removeEventListener('scroll', this.onScroll); this.host?.classList.remove('pdf-reader');
    this.prefetchAbort?.abort(); this.pageCache.clear();
    void this.loading?.destroy(); this.surface = undefined; this.doc = undefined; this.currentPage = undefined;
  }
}
