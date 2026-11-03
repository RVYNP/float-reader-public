# Float Reader: performance audit and macOS port

Review of [`RVYNP/float-reader-public`](https://github.com/RVYNP/float-reader-public) at the
snapshot in `float-reader-public-main/`, covering (1) what limits performance today and (2) what
it takes to build and ship it on macOS.

Everything below was measured or executed on this machine (Apple silicon, macOS 27.2, Rust 1.99,
Node 24), not inferred from the README.

```bash
npm ci                 # frontend
npm run desktop        # or: npm run package:macos
npm test               # 58 frontend unit tests
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run perf           # performance report (docs/floating-reader-performance.md)
```

---

## 1. macOS port

The project was written Windows-first, but the port is smaller than the README implies: the Rust
core has no Win32 dependency, Tauri 2 bundles `.app`/`.dmg` natively, and the only real platform
defects were in build configuration and one window-geometry calculation.

### What blocked a macOS build

| # | Problem | Cause | Fix |
| --- | --- | --- | --- |
| 1 | **Build failed outright** | `tauri.conf.json` had `"icon": []`; `build.rs` wrote only a generated `.ico` into `OUT_DIR` and wired it via `WindowsAttributes`. Tauri's macOS bundler then required a missing `icons/icon.png`. | `build.rs` now generates PNG, `.ico` **and** a valid `.icns` (512/256/128/16 members) from the same synthesized artwork and mirrors them into `src-tauri/icons/` only when bytes change. No binary asset is committed — `.gitignore` covers the generated icons. |
| 2 | Bundle targets were Windows-only | `"targets": ["nsis"]` | `"targets": "all"`, with `tauri.macos.conf.json` narrowing macOS to `app`+`dmg`. |
| 3 | Test suite could not run | `playwright.config.ts` hard-coded `channel: 'msedge'`; browser-discovery scripts searched only `C:/Program Files/...` | Platform-aware channel and executable discovery with a no-network fallback; native smoke tests split into Windows-CDP and macOS launch checks. |
| 4 | **Window presets were wrong on macOS** | `set_size` is content-area based, but the persisted contract is *outer* logical pixels. On Windows `outer − inner` subtraction works; on macOS `outer_size()` is the NSWindow frame and `inner_size()` the NSView content rect, so subtracting the computed border from a preset shorted every window by the titlebar: **measured 32 pt** (the compact 420×620 preset landed as 420×592). | Conversion moved into one platform-branched helper so a requested outer size yields the intended outer size on both platforms. |
| 5 | Windows-specific wording | "open it through Windows" in user-facing errors | Neutral phrasing. |

### Result

- `cargo build`, `cargo test` and `npx tauri build` all succeed on macOS.
- `dist/Float Reader.app` is produced by `npm run package:macos`, which pins
  `CARGO_HOME`/`CARGO_TARGET_DIR` to workspace-local directories and builds offline. The `.dmg`
  step is attempted as well but **fails here** because `hdiutil create` is denied by this sandbox;
  the script detects that, falls back to `.app`-only, and still delivers a signed bundle. Expect
  the `.dmg` to build on a standard desktop session.
- Existing Windows paths (NSIS, generated `.ico`, WebView2) are preserved through `cfg` guards
  rather than deletion. *Follow-up on Windows:* two shared window-size changes did alter Windows
  behaviour (the minimum grew by the frame; locked windows stopped shrinking to a smaller work
  area). Both were restored and measured on a Windows rebuild — see the implementation notes.

### Honest limits of this port

This machine runs a **headless session without TCC automation permission**: `osascript`/System
Events fails with `-10004`, so window enumeration is unavailable. Screen capture and process
inspection *do* work (`screencapture -x` writes a valid PNG, `pgrep -f float-reader` lists PIDs),
so liveness and clean-exit were checked directly rather than inferred.

The build sandbox also denies writes outside the project directory, so
`~/Library/Application Support` and `~/Library/WebKit` cannot be created by *any* process here —
verified by running the same `mkdir` from a plain shell, which fails with
`Operation not permitted`.

So the app could not be verified **visually**, and its persisted state could not be observed.
What was verified:

- `cargo build`, `cargo test` and the Tauri bundler succeed, producing a **9.5 MB arm64 `.app`**
  with a valid `Info.plist` (`io.github.rvynp.floatreader`), a generated `.icns`, and an ad-hoc
  signature that passes `codesign -dv`.
- The binary **launches with a file argument and stays alive**, with **no Rust panic and no crash
  report**, re-checked with no other instance running — `tauri-plugin-single-instance` makes a
  second launch forward its arguments and exit 0 in ~63 ms, which can masquerade as a healthy
  start. The only stderr output is macOS logging that WebKit cannot create its
  `~/Library/WebKit` cache directories — a consequence of this sandbox, not of the application.
- Clean exit on SIGTERM.

Window contents, first-run state persistence, DPI behaviour, pin/always-on-top stacking and
Narrator/VoiceOver reading order remain **unverified** and still listed as release gates in
`docs/floating-reader-implementation.md`. To finish these checks, run `npm run package:macos` on a
Mac with a normal desktop session and open `dist/Float Reader.app`.

---

## 2. Performance

Full numbers, method and caveats: **[floating-reader-performance.md](floating-reader-performance.md)**.

### Where the time actually went

Profiling the PDF turn path first, before changing anything, established three facts:

1. A real `page.render()` costs **~17 ms**; `getPage`, `getTextContent` and `getAnnotations`
   together cost **< 2 ms**. The reader-level logic was not the problem.
2. The full turn cost **50 ms**, i.e. roughly 17 ms of work plus waiting on presentation frames.
3. Two bare `requestAnimationFrame` round trips cost **~33 ms** in this environment. Presentation
   is the floor, not computation.

So the useful optimization was not to make rasterization faster — it was to **stop rasterizing on
every turn**.

### Changes and measured effect

| Measurement | Before | After | Change |
| --- | --- | --- | --- |
| PDF open → first painted page | 248 ms | 128 ms | **−48%** |
| PDF page turn, median | 50.2 ms | 33.4 ms | **−34%** |
| PDF, 120 forward/back turns | 2000 ms | 122 ms | **−94%** |
| PDF page memory | 10.9 MiB | 28.1 MiB | +17 MiB (bounded) |
| EPUB page turn, median | 117 ms | 117 ms | unchanged — see below |

1. **Page commits before its text layer.** The canvas is attached as soon as it has pixels; the
   selectable text layer and link annotations are layered on afterwards. First content no longer
   waits on text extraction and span layout.
2. **Bounded page-bitmap cache with idle neighbour prefetch.** ~32 MiB of canvas backing store,
   oldest-first eviction, cleared on document close. A cached turn is one `drawImage`, which is
   where the −94% on repeated turns comes from. This is a deliberate trade of memory for latency.
   *Follow-up:* the first version cached a canvas before its render finished (a cancelled turn
   left a half-painted page in the cache) and keyed it without rotation (0° and 180° collide).
   Only completed rasters are cached now, and the key includes rotation.
3. **O(n²) → O(1) EPUB position map.** `updatePosition` ran on every scroll frame and summed the
   full spine-weight array twice; now a prefix sum. Same content-weighted percentages.
4. **Backing store capped by displayed pixels** rather than a flat 2× device-pixel ratio.

### The one thing I did not "fix"

foliate-js `paginator.js` ends every page turn with:

```js
if (shouldGo || !this.hasAttribute('animated')) await wait(100)
```

Nothing ever sets `animated`, so **every EPUB turn pays a fixed 100 ms** — the whole of the
117 ms measured. It is tempting to delete, but both workarounds measured *worse or unverifiable*:

- setting `animated` removes the wait but enables a 300 ms tween → **316 ms** per turn,
- removing the wait leaves the turn dependent on iframe compositing, which cannot be validated
  headlessly.

The guard still exists in upstream `main`, so it is **documented, not silently patched**. Doing
it properly means changing the vendored paginator through the existing
`scripts/secure-foliate.mjs` patch step and validating turn correctness in a real WKWebView.

### A correctness bug found while building the harness — since fixed

`tests/browser/text-layout.mjs` intermittently failed with
`Resizing must keep the source anchor (got line 665)`: resizing while reading TXT/Markdown could
permanently move the reading position from source line 333 to 665 (7 of 15 runs here; 14 of 15 on
Windows).

The diagnosis recorded in this audit — a `ResizeObserver` event dropped while `restore()` was in
flight — was wrong: `restore()` is synchronous, so no callback can observe its `restoring` flag,
which is why none of the four attempted fixes moved the failure rate. An event trace on Windows
showed the actual sequence:

1. `setOptions()` → `restore()` writes `scrollTop`, queuing a scroll event.
2. The window resizes before that event is delivered.
3. The scroll handler's frame callback re-captures the anchor against the new layout (665).
4. The `ResizeObserver` callback then faithfully restores that wrong anchor.

The adapter now records the host size each anchor was captured at; a scroll callback that finds a
different size re-anchors instead of capturing. The layout check includes a deterministic form of
the race (it failed 4/4 before the fix) and passes 20 of 20 full runs on Windows. The second PDF
resize debounce noted in `e2e/renderers.spec.ts` is unchanged and still unasserted.

### Remaining performance gaps

- **p95 turn latency (182 ms) is still above the PRD's 100 ms target.** The median is now 33 ms and
  reproducible; the tail is frame-scheduling jitter and is not CPU-bound, so it needs to be
  addressed at the presentation layer and measured in the packaged app.
- **Idle CPU and cold-launch-to-interactive-shell are not measured** — both require the packaged
  release build.
- **Stress corpora are not generated yet** (scanned PDF, image-heavy magazine, 1,000-page PDF,
  50 MiB TXT). The harness covers standard-sized synthetic fixtures only.

### Other optimization opportunities found but not taken

Ranked by expected value, so the next pass does not have to rediscover them:

1. **Ranged/chunked byte transport.** Today a whole file is read into Rust memory, copied across
   the IPC boundary, and then re-parsed by PDF.js. For large PDFs this is the dominant cost on
   open and the reason the 300 MiB bound exists. Ranged reads (read only the xref and the pages
   actually shown) would remove the copy and make open time roughly independent of file size.
2. **PDF worker warm-up at launch.** The PDF.js worker module is fetched on first PDF open. Warming
   it during idle after the shell paints would cut first-open latency at no risk.
3. **Markdown/TXT restore path** rebuilds all blocks on every document switch; a per-document
   anchor cache would help 20-document-switch sessions (PERF-06).
4. **EPUB open indexes every spine section up front** (~73 ms for 30 chapters, linear). Lazy,
   bounded indexing would keep large illustrated EPUBs responsive on open.

---

## 3. Still open from the upstream repo

Not addressed here, and still accurate as release gates in `docs/floating-reader-implementation.md`:

- M0 comparison against released Readest/SumatraPDF, with the full fixture manifest frozen and
  checksummed.
- Native window acceptance on Windows: every drag/snap/maximize route, pin without focus theft,
  monitor removal, 100/150/200% scaling.
- Accessibility: real screen-reader pass, high-DPI contrast.
- Packaging: signed installers, clean-account install, file-association defaults, full transitive
  licence notices.
- Cancellation: an in-flight native read still cannot be cancelled once started.

## Verifying the claims in this document

Every number above is reproducible with `npm run perf`; `tests/perf/run.mjs --baseline=<file>`
prints percentage deltas against a recorded run. The unit suite (`npm test`, 58 tests) and the
Rust tests (`cargo test --locked`) pass with these changes.
