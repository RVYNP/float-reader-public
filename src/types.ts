export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' | 'avif' | 'bmp';
export type Format = 'pdf' | 'epub' | 'md' | 'txt' | ImageFormat;
export type Locator = { kind: Format; [key: string]: unknown };
export type Position = {
  label: string; fraction: number; locator: Locator;
  scrub: { current: number; total: number; unit: 'page' | 'line' | 'percent' };
};
export type OutlineItem = { label: string; target: string };
export type ReaderOptions = { fontSize: number; lineHeight: number; margin: number; wrap: boolean; fit: 'page' | 'width'; zoom: number; rotation: number };
export const defaultOptions: ReaderOptions = { fontSize: 18, lineHeight: 1.65, margin: 24, wrap: true, fit: 'page', zoom: 1, rotation: 0 };
export type ReaderSource = { name: string; bytes: Uint8Array; format: Format; path?: string };
export type ReaderContext = {
  onPosition: (position: Position) => void;
  onError: (error: unknown) => void;
  openExternal: (url: string) => Promise<void>;
  requestPassword: () => Promise<string | null>;
  resolveImage?: (relative: string) => Promise<string>;
  /** A same-origin content frame finished loading. Pointer input inside it never reaches the host, so the hand tool listens there directly. */
  onFrame?: (doc: Document) => void;
};
export interface ReaderAdapter {
  readonly mode: 'fixed' | 'paginated' | 'scroll';
  open(source: ReaderSource, host: HTMLElement, context: ReaderContext, options: ReaderOptions): Promise<void>;
  navigate(action: 'next' | 'previous' | 'screen-next' | 'screen-previous' | 'start' | 'end' | 'back'): Promise<void>;
  goTo(target: string): Promise<void>;
  getPosition(): Position;
  restore(locator: Locator): Promise<void>;
  setOptions(options: ReaderOptions): Promise<void>;
  outline(): OutlineItem[];
  /** The element that scrolls page-based content, for the view controls and hand tool; absent when content reflows instead of zooming. */
  scroller?(): HTMLElement | undefined;
  destroy(): void;
}
