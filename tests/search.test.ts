import { describe, expect, it } from 'vitest';
import { MAX_QUERY_LENGTH, countMatches, excerpt, findMatches, pageOfHits, searchUnits } from '../src/search';

const spans = (text: string, query: string, options = {}) => findMatches(text, query, options).map(match => text.slice(match.start, match.end));

describe('findMatches', () => {
  it('finds every occurrence in reading order', () => {
    const text = 'the cat and the cat.';
    expect(findMatches(text, 'cat').map(match => match.start)).toEqual([4, 16]);
  });

  it('reports offsets that slice the matched text exactly', () => {
    const text = 'A needle in a haystack';
    const [match] = findMatches(text, 'needle');
    expect(text.slice(match.start, match.end)).toBe('needle');
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(countMatches('Cat cat CAT', 'cat')).toBe(3);
    expect(countMatches('Cat cat CAT', 'cat', { matchCase: true })).toBe(1);
  });

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(findMatches('some text', '')).toEqual([]);
    expect(findMatches('some text', '   ')).toEqual([]);
  });

  it('returns nothing when the query is absent or the haystack is empty', () => {
    expect(findMatches('some text', 'zebra')).toEqual([]);
    expect(findMatches('', 'cat')).toEqual([]);
  });

  it('matches non-overlapping occurrences only', () => {
    // "aa" in "aaaa" is two matches, so Next advances rather than stepping one character.
    expect(findMatches('aaaa', 'aa')).toHaveLength(2);
  });

  it('finds matches at the very start and end of the text', () => {
    expect(findMatches('cat', 'cat')).toEqual([{ start: 0, end: 3 }]);
    expect(findMatches('a cat', 'cat')).toEqual([{ start: 2, end: 5 }]);
  });

  it('matches a query that spans line breaks', () => {
    const text = 'a line\nb line';
    // The query is the visible phrase; the newline is part of the document text.
    expect(countMatches(text, 'a line\nb')).toBe(1);
  });

  it('handles unicode text and combining characters', () => {
    expect(countMatches('café CAFÉ', 'café')).toBe(2);
    expect(spans('Grüße grüße', 'grüße')).toEqual(['Grüße', 'grüße']);
  });

  it('restricts matches to whole words when asked', () => {
    const text = 'cat witnesscat cat.';
    // 'witnesscat' ends in "cat" but the preceding letter makes it a longer word.
    expect(findMatches(text, 'cat', { wholeWord: true }).map(match => match.start)).toEqual([0, 15]);
    // Punctuation is a boundary.
    expect(spans('a cat, a cat', 'cat', { wholeWord: true })).toEqual(['cat', 'cat']);
  });

  it('treats digits and underscores as word characters', () => {
    expect(countMatches('cat_1 cat1 cat', 'cat', { wholeWord: true })).toBe(1);
  });

  it('ignores an over-long query instead of scanning with it', () => {
    const long = 'a'.repeat(MAX_QUERY_LENGTH + 1);
    expect(findMatches(long, long)).toEqual([]);
  });

  it('finds the same number of matches with and without whole-word mode when no boundary interferes', () => {
    const text = ' one two three ';
    expect(countMatches(text, 'two')).toBe(countMatches(text, 'two', { wholeWord: true }));
  });
});

describe('excerpt', () => {
  it('keeps the match and collapses whitespace around it', () => {
    const text = 'The quick brown cat\nsat here';
    const [match] = findMatches(text, 'cat');
    const line = excerpt(text, match.start, match.end);
    expect(line).toContain('cat');
    expect(line).not.toContain('\n');
  });

  it('marks clipped ends with an ellipsis', () => {
    const text = `${'x'.repeat(200)} target ${'y'.repeat(200)}`;
    const [match] = findMatches(text, 'target');
    const line = excerpt(text, match.start, match.end);
    expect(line.startsWith('…')).toBe(true);
    expect(line.endsWith('…')).toBe(true);
    expect(line).toContain('target');
  });

  it('does not add a leading ellipsis when the match starts the text', () => {
    const line = excerpt('target is here', 0, 6);
    expect(line.startsWith('target')).toBe(true);
  });

  it('stays short even for a very long paragraph', () => {
    const text = `${'word '.repeat(500)}FIND ME${' more'.repeat(500)}`;
    const [match] = findMatches(text, 'FIND ME');
    expect(excerpt(text, match.start, match.end).length).toBeLessThan(140);
  });
});

describe('searchUnits', () => {
  const units = [
    { text: 'alpha beta gamma', number: 1, label: 'Page 1' },
    { text: 'delta beta', number: 2, label: 'Page 2' },
    { text: 'nothing here', number: 3, label: 'Page 3' },
  ];

  it('returns hits from every unit in order, tagged with their unit', () => {
    const { hits, truncated } = searchUnits(units, 'beta');
    expect(hits.map(hit => hit.unitLabel)).toEqual(['Page 1', 'Page 2']);
    expect(truncated).toBe(false);
    expect(hits[0].text).toBe('beta');
  });

  it('gives offsets relative to the unit, not the whole document', () => {
    const { hits } = searchUnits(units, 'delta');
    expect(hits[0].start).toBe(0);
    expect(hits[0].unit).toBe(2);
  });

  it('reports truncation rather than building an unbounded list', () => {
    const big = [{ text: 'a '.repeat(1000), number: 1, label: 'Line 1' }];
    const result = searchUnits(big, 'a', { maxHits: 10 });
    expect(result.hits).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchUnits(units, '').hits).toEqual([]);
  });

  it('honours match-case and whole-word options across units', () => {
    const mixed = [{ text: 'Beta beta beta2', number: 1, label: 'Block 1' }];
    expect(searchUnits(mixed, 'Beta').hits).toHaveLength(3);
    expect(searchUnits(mixed, 'Beta', { matchCase: true }).hits).toHaveLength(1);
    // "Beta" and "beta" are both whole words; "beta2" is not.
    expect(searchUnits(mixed, 'beta', { wholeWord: true }).hits).toHaveLength(2);
  });
});

describe('pageOfHits', () => {
  const hits = Array.from({ length: 5 }, (_, index) => ({ text: 'x', excerpt: 'x', start: index, end: index + 1, unit: 1, unitLabel: 'Page 1' }));

  it('slices results into pages of a fixed size', () => {
    expect(pageOfHits(hits, 0, 2)).toHaveLength(2);
    expect(pageOfHits(hits, 2, 2)).toHaveLength(1);
    expect(pageOfHits(hits, 9, 2)).toEqual([]);
  });
});
