import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import './pdf.css';
import type { Locator, OutlineItem, Position, ReaderAdapter, ReaderContext, ReaderOptions, ReaderSource } from '../types';

GlobalWorkerOptions.workerSrc = workerURL;
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
      const rotation = ((page.rotate + this.options.rotation) % 360 + 360) % 360;
      const base = page.getViewport({ scale: 1, rotation });
      const width = Math.max(100, this.host.clientWidth - 32), height = Math.max(100, this.host.clientHeight - 32);
      const fit = this.options.fit === 'width' ? width / base.width : Math.min(width / base.width, height / base.height);
      const scale = fit * clamp(this.options.zoom, .25, 5);
      const viewport = page.getViewport({ scale, rotation });
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
      const surface = document.createElement('div'); surface.className = 'pdf-page';
      surface.style.width = `${viewport.width}px`; surface.style.height = `${viewport.height}px`;
      surface.style.setProperty('--scale-factor', String(scale));
      surface.style.setProperty('--total-scale-factor', String(scale));
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
      canvas.width = Math.ceil(viewport.width * dpr); canvas.height = Math.ceil(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      surface.append(canvas);
      const task = this.task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      void task.promise.catch(() => {}); // Cancellation can occur while text extraction is still pending.
      const text = await page.getTextContent();
      if (generation !== this.generation || this.disposed) { task.cancel(); return; }
      const textContainer = document.createElement('div'); textContainer.className = 'textLayer';
      surface.append(textContainer);
      const layer = this.layer = new TextLayer({ textContentSource: text, container: textContainer, viewport });
      await Promise.all([task.promise, layer.render()]);
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
      const previous = this.currentPage;
      this.currentPage = page; this.page = target; this.surface = surface;
      this.host.replaceChildren(surface); this.host.removeAttribute('aria-busy');
      this.host.scrollTop = atEnd ? this.host.scrollHeight : clamp(y) * viewport.height;
      this.host.scrollLeft = clamp(x) * viewport.width;
      this.explicitEnd = atEnd;
      if (previous && previous !== page) previous.cleanup();
      this.report();
    } catch (error) {
      if (generation !== this.generation || this.disposed || (error as Error).name === 'RenderingCancelledException') return;
      this.requested = this.page; this.host.removeAttribute('aria-busy');
      status.textContent = `Page ${target} could not be rendered. `;
      const retry = document.createElement('button'); retry.textContent = 'Retry'; retry.onclick = () => { void this.render(target, y, x).catch(this.context.onError); }; status.append(retry);
      throw error;
    }
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
    void this.loading?.destroy(); this.surface = undefined; this.doc = undefined; this.currentPage = undefined;
  }
}
