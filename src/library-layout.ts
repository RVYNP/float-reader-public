// Side-by-side library sizing. Pure so the clamping edges stay testable without a DOM.
export const libraryWidth = { default: 270, min: 240, max: 520, step: 16, largeStep: 64 } as const;
/** Handle hit area between the panel and the reading panel. */
export const libraryHandleWidth = 10;
const maxViewportShare = .55;
const minReadingWidth = 320;
// Outer 6 px margins on both sides of the reader layout plus the handle.
const layoutChrome = 6 + 6 + libraryHandleWidth;

export type LibrarySide = 'left' | 'right';

export function libraryWidthBounds(viewport: number): { min: number; max: number } {
  const max = Math.floor(Math.min(libraryWidth.max, viewport * maxViewportShare, viewport - layoutChrome - minReadingWidth));
  // A window too narrow for both limits keeps the panel usable; the compact overlay takes over below 720 px.
  return { min: libraryWidth.min, max: Math.max(libraryWidth.min, max) };
}

export function clampLibraryWidth(width: number, viewport: number): number {
  const { min, max } = libraryWidthBounds(viewport);
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(width) ? width : libraryWidth.default)));
}

export function parseLibraryWidth(saved: string | null): number {
  const value = saved === null ? NaN : Number(saved);
  return Number.isFinite(value) && value > 0 ? value : libraryWidth.default;
}
