// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeEpubMarkup, validArchivePath } from '../src/adapters/epub';

const chapter = (body: string, head = '') => `<html xmlns="http://www.w3.org/1999/xhtml"><head>${head}</head><body>${body}</body></html>`;
const parse = (markup: string) => new DOMParser().parseFromString(markup, 'application/xhtml+xml');

describe('EPUB content boundary', () => {
  it('removes scripts, event handlers, frames, forms and redirects before rendering', () => {
    const output = parse(sanitizeEpubMarkup(chapter('<script>parent.__TAURI_INTERNALS__.invoke("danger")</script><p onclick="alert(1)">Keep text</p><iframe srcdoc="bad"/><form><input/></form>', '<base href="https://bad.test/"/><meta http-equiv="refresh" content="0;url=https://bad.test/"/>')));
    expect(output.querySelector('script,iframe,form,input,base,[onclick]')).toBeNull();
    expect(output.querySelector('body')?.textContent).toContain('Keep text');
    const csp = output.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');
    expect(csp).toContain("script-src 'none'"); expect(csp).toContain("connect-src 'none'");
    expect(output.querySelector('meta[http-equiv="refresh"]')).toBeNull();
  });
  it('keeps archive images before rewriting and blob resources after rewriting', () => {
    const before = parse(sanitizeEpubMarkup(chapter('<img src="../images/cover.png"/><a href="chapter2.xhtml#note">Footnote</a>')));
    expect(before.querySelector('img')?.getAttribute('src')).toBe('../images/cover.png');
    const after = parse(sanitizeEpubMarkup(chapter('<img src="blob:https://app.test/123"/><img src="https://bad.test/track"/><img src="missing.png"/>'), 'application/xhtml+xml', true));
    expect(Array.from(after.querySelectorAll('img')).map(img => img.getAttribute('src'))).toEqual(['blob:https://app.test/123', null, null]);
  });
  it('preserves a clickable HTTPS link but removes executable URLs and automatic fetch hints', () => {
    const doc = parse(sanitizeEpubMarkup(chapter('<a href="https://example.test/" ping="https://track.test/">Site</a><a href="javascript:alert(1)">Bad</a><img srcset="https://bad.test/a 2x"/>', '<link rel="prefetch" href="https://bad.test/"/>')));
    expect(doc.querySelectorAll('a')[0].getAttribute('href')).toBe('https://example.test/');
    expect(doc.querySelectorAll('a')[1].getAttribute('href')).toBeNull();
    expect(doc.querySelector('[ping],[srcset],link')).toBeNull();
  });
  it('keeps fixed-layout viewport and provides an unsupported-media placeholder', () => {
    const doc = parse(sanitizeEpubMarkup(chapter('<video src="movie.mp4"/><p>Following passage</p>', '<meta name="viewport" content="width=800,height=1000"/>')));
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe('width=800,height=1000');
    expect(doc.querySelector('video')).toBeNull();
    expect(doc.querySelector('body')?.textContent).toContain('Embedded audio/video is unavailable');
    expect(doc.querySelector('body')?.textContent).toContain('Following passage');
  });
  it('rejects malformed XML explicitly', () => {
    expect(() => sanitizeEpubMarkup('<html><broken></html>')).toThrow('malformed');
  });
  it.each(['../outside', '/absolute', 'C:/file', 'a\\file', 'OPS/../../bad', 'https://example.test/a'])('rejects unsafe archive resource %s', path => {
    expect(validArchivePath(path)).toBe(false);
  });
  it('accepts normal package resources and Unicode paths', () => {
    expect(validArchivePath('OPS/chapters/étude.xhtml')).toBe(true);
    expect(validArchivePath('META-INF/container.xml')).toBe(true);
  });
});
