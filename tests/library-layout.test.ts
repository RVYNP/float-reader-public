import { describe, expect, it } from 'vitest';
import { clampLibraryWidth, libraryWidthBounds, parseLibraryWidth } from '../src/library-layout';

// Bounds for the floating drawer's width: the drawer overlays the page, but these limits still
// guarantee the reading panel keeps a usable strip of page visible.
describe('library drawer width', () => {
  it('caps at 520 px, then 55% of the window, then a 320 px reading panel', () => {
    expect(libraryWidthBounds(1400)).toEqual({ min: 240, max: 520 });
    expect(libraryWidthBounds(800)).toEqual({ min: 240, max: 440 });
    // At the 720 px breakpoint the reading-panel floor (720 - 22 - 320) is tighter than 55%.
    expect(libraryWidthBounds(720)).toEqual({ min: 240, max: 378 });
  });

  it('never lets the maximum fall below the minimum in a window narrower than both limits', () => {
    expect(libraryWidthBounds(500)).toEqual({ min: 240, max: 240 });
    expect(clampLibraryWidth(400, 500)).toBe(240);
  });

  it('clamps, rounds, and falls back to the default for unreadable saved widths', () => {
    expect(clampLibraryWidth(100, 1080)).toBe(240);
    expect(clampLibraryWidth(900, 1080)).toBe(520);
    expect(clampLibraryWidth(300.6, 1080)).toBe(301);
    expect(clampLibraryWidth(Number.NaN, 1080)).toBe(270);
    for (const saved of [null, '', 'wide', '-5', 'Infinity']) expect(parseLibraryWidth(saved)).toBe(270);
    expect(parseLibraryWidth('340')).toBe(340);
  });
});
