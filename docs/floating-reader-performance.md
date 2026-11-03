# Float Reader performance

Measured on an Apple-silicon Mac (macOS 27.2, arm64) with Node 24 and headless Chromium 153.
Numbers describe the **reader's own work** — decode, layout, paint and adapter logic — not the
packaged OS WebView. Absolute values will differ in the app; before/after ratios carry over.

Reproduce the whole report with:

```bash
npm run build
npm run perf          # human-readable table
npm run perf:json     # full machine-readable report
```

The harness lives in `tests/perf/` and generates every fixture from source
(`tests/perf/fixtures.mjs`), so runs are byte-comparable and no binary media is committed.

## Headline results

| Measurement | Before | After | Change |
| --- | --- | --- | --- |
| PDF open → first painted page (120 pages, text) | 248 ms | 128 ms | **−48%** |
| PDF page turn, median | 50.2 ms | 33.4 ms | **−34%** |
| PDF page turn, 95th percentile | 175.6 ms | 182.1 ms | unchanged (frame-scheduling jitter) |
| PDF, 120 forward/back turns | 2000 ms | 122 ms | **−94%** |
| PDF page memory after session | 10.9 MiB | 28.1 MiB | +17 MiB (bounded by design) |
| Markdown open (120 KiB) | 41 ms | 41 ms | — |
| TXT open (1 MiB) | 107 ms | 107 ms | — |
| EPUB page turn, median | 117 ms | 117 ms | — (upstream throttle, see below) |

The PRD target for page turns is p95 ≤ 100 ms on cached pages. **The median now sits at 33 ms,
but p95 is still above target** and is the remaining gap.

## What was changed, and why

### 1. Painted the page before its text layer (PDF)

`render()` used to `await Promise.all([canvasRender, textLayer.render()])` and only then attach
the surface to the DOM. First content therefore waited for the slowest of the two.

The page is now committed as soon as it has pixels; the selectable text layer and link
annotations are appended to the already-visible surface immediately afterwards. First content
no longer waits on text extraction or span layout.

### 2. Bounded page-bitmap cache with idle neighbour prefetch (PDF)

Profiling showed the turn itself was already close to its floor: a real `page.render()` costs
~17 ms, `getPage`/`getTextContent`/`getAnnotations` together cost under 2 ms, and the remaining
time was frame scheduling.

So the win is to not rasterize at all. The most recent page bitmaps are kept in a cache bounded
at **32 MiB of canvas backing store**, and the two neighbouring pages are rendered at idle. A
turn that hits the cache is a single `drawImage`: **120 consecutive turns dropped from 2000 ms to
122 ms**. The cache is cleared on `destroy()`, so no memory outlives a document.

This is a deliberate trade: roughly 17 MiB more resident memory in exchange for near-instant
turns. The bound is a named constant (`PAGE_CACHE_BYTES`) and is evicting by oldest-first.

### 3. Removed an O(n²) sum in the EPUB position map

`updatePosition()` ran on every `relocate` event — that is, on every scroll frame — and summed
the full spine-weight array twice to compute a fraction. Replaced with a precomputed prefix-sum
(`weightPrefix`) and a cached total, making each update O(1) per relocation. Correctness is
identical: the same content-weighted map, computed incrementally.

### 4. Backing store capped by displayed pixels

The canvas device-pixel ratio is now `min(devicePixelRatio, 2, sqrt(16M / viewportArea))`, and
the cache key includes the resulting pixel dimensions, so a cached bitmap is only reused when it
matches exactly what would be drawn.

## The remaining gap: page turns are frame-scheduling, not CPU

Repeated measurement of the same build gives a **stable median of 33–34 ms and a p95 anywhere
from 99 to 254 ms**. The median is reproducible; the tail is not. The floor is set by
presentation: with nothing else happening, two `requestAnimationFrame` round trips already take
~33 ms in this environment. A turn that has fully cached work still costs one frame.

That means p95 cannot be brought below 100 ms by optimizing the reader further — it needs the
turn to be scheduled so the new page reaches the compositor in fewer frames, which has to be
validated in the packaged WebView rather than in headless Chromium.

## EPUB page turns: an upstream throttle, deliberately left alone

foliate-js `paginator.js` `#turnPage()` ends with:

```js
if (shouldGo || !this.hasAttribute('animated')) await wait(100)
```

Nothing in the library or in this app ever sets `animated`, so **every EPUB page turn incurs a
fixed 100 ms wait** — which is the entire 117 ms measured. Scrolling itself costs 0–0.4 ms.

Two obvious "fixes" were measured and both are wrong:

- Setting the `animated` attribute removes the wait but also turns on a 300 ms tweened
  `animate()` scroll, making turns **slower** (316 ms measured).
- Removing the wait outright leaves the turn dependent on iframe compositing, which cannot be
  verified in this headless environment.

The wait is a deliberate guard in upstream (it is still present in the latest `main`), so it is
**documented here and not worked around**. Replacing it safely means changing the vendored
paginator through the existing `scripts/secure-foliate.mjs` patch step, then validating turn
correctness in a real WKWebView session. That is a follow-up with its own test, not a silent
edit.

## Method notes and limits

- `performance.measureUserAgentSpecificMemory()` is used where available; it reports the page
  only, not the whole process tree, so it is **not** comparable to the PRD's process-tree
  private-bytes metric.
- The suite measures a 120-page synthetic text PDF, a 1 MiB TXT, a 120 KiB Markdown document and
  a 30-chapter reflowable EPUB. Stressed corpora (scanned PDFs, image-heavy magazines,
  1,000-page PDFs, 50 MiB TXT) are not yet generated; the PRD still lists them as `Awaiting`.
- Idle CPU and cold-launch-to-interactive-shell are **not** covered here — they need the packaged
  app and a release build.
- Compare runs on the same machine: the same build varies by up to 2.5× in p95 between runs.
  Use `--baseline=<file.json>` to get a percentage delta rather than comparing raw numbers.

## Recording a baseline

```bash
node tests/perf/run.mjs --record=perf-baseline.json
# ...make a change...
node tests/perf/run.mjs --baseline=perf-baseline.json
```
