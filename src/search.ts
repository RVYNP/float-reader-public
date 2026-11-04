/**
 * In-document text search, shared by the PDF, EPUB and text adapters.
 *
 * Search is deliberately split from highlighting: this module turns a query into ordered
 * matches over an already-extracted plain-text string, and the adapters decide how each match
 * maps back to their own coordinate system (a PDF page index, an EPUB section, a text node).
 *
 * Keeping it here, DOM-free, means the matching rules — case folding, whole-word mode, result
 * ordering, the wrapping scan — are unit-tested once rather than three times.
 */

export type SearchOptions = {
  /** Match case exactly instead of folding it. */
  matchCase?: boolean;
  /** Only match whole words: `cat` must not match `catalog`. */
  wholeWord?: boolean;
};

export type SearchMatch = {
  /** Offset of the first character of the match within the haystack. */
  start: number;
  /** Offset one past the last character of the match. */
  end: number;
};

/** Longest query we will search for; longer values are treated as no query. */
export const MAX_QUERY_LENGTH = 200;

/** Characters that count as word separators for whole-word matching. */
const WORD = /[\p{L}\p{N}_]/u;

const isWord = (character: string | undefined) => character !== undefined && WORD.test(character);

/**
 * Every non-overlapping match of `query` in `haystack`, in reading order.
 *
 * Matching is non-overlapping on purpose: searching "aa" in "aaaa" is two matches, not three
 * offset by one, which is what every reader application does and what makes Next advance.
 *
 * Case folding uses `toLocaleLowerCase` so Turkish dotted/dotless i behaves like the rest of
 * the app (which uses the same call for library search). Folding can change string length for a
 * few scripts, so offsets are only used when the folded and original text agree in length; when
 * they do not, the search falls back to case-sensitive matching so a match is never reported at
 * an offset that slices the wrong characters.
 */
export function findMatches(haystack: string, query: string, options: SearchOptions = {}): SearchMatch[] {
  if (!query || query.length > MAX_QUERY_LENGTH || !haystack) return [];
  const folded = !options.matchCase;
  const needle = folded ? query.toLocaleLowerCase() : query;
  if (!needle) return [];
  const text = folded ? haystack.toLocaleLowerCase() : haystack;
  const usable = text.length === haystack.length;

  const matches: SearchMatch[] = [];
  let at = 0;
  while (at <= text.length - needle.length) {
    const index = text.indexOf(needle, at);
    if (index < 0) break;
    const end = index + needle.length;
    if (!options.wholeWord || (wholeWordAt(haystack, index, end) && usable)) matches.push({ start: index, end });
    at = end;
  }
  return matches;
}

function wholeWordAt(haystack: string, start: number, end: number): boolean {
  return !isWord(haystack[start - 1]) && !isWord(haystack[end]);
}

/** Total number of matches, without building the list. Used for counts that never highlight. */
export function countMatches(haystack: string, query: string, options: SearchOptions = {}): number {
  return findMatches(haystack, query, options).length;
}

export type SearchHit = {
  /** The matched text, as it appears in the document (not its folded form). */
  text: string;
  /** A short excerpt around the match for the results list, with ellipses at clipped ends. */
  excerpt: string;
  start: number;
  end: number;
  /** Index of the page, section or block containing the match. */
  unit: number;
  /** 1-based label of the containing unit, e.g. the printed page number. */
  unitLabel: string;
};

export type UnitText = {
  /** The unit's plain text. Offsets in the returned hits are relative to this string. */
  text: string;
  /** 1-based number of this unit. */
  number: number;
  /** What to call the unit in the results list. */
  label: string;
};

/** Clipped context on each side of a match, in characters. */
const EXCERPT_CONTEXT = 42;

/**
 * Searches many units (pages, sections, text blocks) and returns flat, ordered hits.
 *
 * `maxHits` bounds the work for pathological documents such as a 50 MiB TXT file where a
 * single-letter query matches hundreds of thousands of times: the caller learns there were at
 * least that many rather than blocking the reader to build them all.
 */
export function searchUnits(units: readonly UnitText[], query: string, options: SearchOptions & { maxHits?: number } = {}): { hits: SearchHit[]; truncated: boolean } {
  const limit = options.maxHits ?? 2000;
  const hits: SearchHit[] = [];
  for (const unit of units) {
    for (const match of findMatches(unit.text, query, options)) {
      if (hits.length >= limit) return { hits, truncated: true };
      hits.push({ text: unit.text.slice(match.start, match.end), excerpt: excerpt(unit.text, match.start, match.end), start: match.start, end: match.end, unit: unit.number, unitLabel: unit.label });
    }
  }
  return { hits, truncated: false };
}

/** A one-line excerpt around a match, collapsing whitespace and marking clipped ends. */
export function excerpt(text: string, start: number, end: number, context = EXCERPT_CONTEXT): string {
  const before = text.slice(Math.max(0, start - context), start).replace(/\s+/g, ' ');
  const after = text.slice(end, end + context).replace(/\s+/g, ' ');
  // Clip a leading partial word so the excerpt does not start mid-word unless it starts the text.
  const lead = start - context > 0 ? `…${before.replace(/^\S*/, '')}` : before.replace(/^\s+/, '');
  const trail = end + context < text.length ? `${after.replace(/\S*$/, '')}…` : after.replace(/\s+$/, '');
  return `${lead}${text.slice(start, end).replace(/\s+/g, ' ')}${trail}`.trim();
}

/**
 * Where a match falls inside a wrapping sequence, for callers that page the results list.
 * Returns the hit index range belonging to `page` when results are cut into pages of `size`.
 */
export function pageOfHits(hits: readonly SearchHit[], page: number, size: number): SearchHit[] {
  return hits.slice(page * size, page * size + size);
}

/** Everything an adapter knows about one search, before the find bar picks a match to reveal. */
export type DocumentSearch = {
  hits: SearchHit[];
  /** True when the adapter stopped early and more matches exist than it returned. */
  truncated: boolean;
  /**
   * Why the document cannot be searched, when `hits` is empty for a reason other than no
   * match: an image has no text, a scanned PDF has no text layer. Absent when a real search
   * ran and simply found nothing.
   */
  unavailable?: string;
};

/** An empty result carrying an explanation, used by adapters that cannot search at all. */
export const unsupportedSearch = (unavailable: string): DocumentSearch => ({ hits: [], truncated: false, unavailable });

