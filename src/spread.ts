/**
 * Two-page spread pairing, shared by the PDF and EPUB adapters and the scrubber preview.
 * Pages are 1-based and in reading order; nothing here knows about rendering.
 */

/** Narrowest reading panel (CSS px) that shows two pages; narrower panels wait in single-page view. */
export const MIN_SPREAD_WIDTH = 600;

/**
 * The pages shown together with `page`. With `cover` (book convention) page 1 stands alone and
 * pairs follow as 2–3, 4–5…; without it pairs are 1–2, 3–4…. A final page without a partner stands alone.
 */
export function spreadPages(page: number, count: number, cover: boolean): number[] {
  const total = Math.max(1, Math.trunc(count) || 1);
  const p = Math.max(1, Math.min(total, Math.trunc(Number.isFinite(page) ? page : 1)));
  if (cover && p === 1) return [1];
  const first = (p % 2 === 0) === cover ? p : p - 1;
  return first < total ? [first, first + 1] : [first];
}

/** Footer wording: "Pages 2–3 of 27", or "Page 1 of 27" for a page shown alone. */
export function pagesLabel(pages: readonly number[], total: number): string {
  return pages.length > 1 ? `Pages ${pages[0]}–${pages.at(-1)} of ${total}` : `Page ${pages[0]} of ${total}`;
}

/**
 * Explicit EPUB page-spread sides that pair the first page with the second (no cover page).
 * A declared `center` page stays alone and restarts the pairing after it. Right-to-left
 * books place the earlier page of each pair on the right.
 */
export function pairedSides(declared: readonly (string | undefined)[], rtl: boolean): ('left' | 'right' | 'center')[] {
  const first = rtl ? 'right' : 'left', second = rtl ? 'left' : 'right';
  let next: 'left' | 'right' = first;
  return declared.map(side => {
    if (side === 'center') { next = first; return 'center'; }
    const current = next; next = current === first ? second : first; return current;
  });
}
