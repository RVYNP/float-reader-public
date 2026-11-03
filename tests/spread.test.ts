import { describe, expect, it } from 'vitest';
import { pagesLabel, pairedSides, spreadPages } from '../src/spread';

const all = (count: number, cover: boolean) => [...new Set(Array.from({ length: count }, (_, i) => spreadPages(i + 1, count, cover).join('–')))];

describe('two-page spread pairing', () => {
  it('shows the cover alone, then book pairs, for odd and even page counts', () => {
    expect(all(7, true)).toEqual(['1', '2–3', '4–5', '6–7']);
    expect(all(8, true)).toEqual(['1', '2–3', '4–5', '6–7', '8']);
  });

  it('pairs from the first page when the document has no cover', () => {
    expect(all(7, false)).toEqual(['1–2', '3–4', '5–6', '7']);
    expect(all(8, false)).toEqual(['1–2', '3–4', '5–6', '7–8']);
  });

  it('returns the same spread for either page of a pair and clamps out-of-range pages', () => {
    expect(spreadPages(5, 27, true)).toEqual([4, 5]);
    expect(spreadPages(4, 27, true)).toEqual([4, 5]);
    expect(spreadPages(0, 27, true)).toEqual([1]);
    expect(spreadPages(99, 27, false)).toEqual([27]);
    expect(spreadPages(Number.NaN, 3, false)).toEqual([1, 2]);
    expect(spreadPages(1, 1, false)).toEqual([1]);
    expect(spreadPages(1, 2, true)).toEqual([1]);
    expect(spreadPages(2, 2, true)).toEqual([2]);
  });

  it('labels a pair and a lone page', () => {
    expect(pagesLabel([2, 3], 27)).toBe('Pages 2–3 of 27');
    expect(pagesLabel([1], 27)).toBe('Page 1 of 27');
  });

  it('assigns EPUB sides that pair the first two pages, restarting after a centred page', () => {
    expect(pairedSides([undefined, 'right', undefined, undefined], false)).toEqual(['left', 'right', 'left', 'right']);
    expect(pairedSides([undefined, undefined, 'center', undefined, undefined], false)).toEqual(['left', 'right', 'center', 'left', 'right']);
    // Right-to-left books read the right-hand page of each pair first.
    expect(pairedSides([undefined, undefined, undefined], true)).toEqual(['right', 'left', 'right']);
  });
});
