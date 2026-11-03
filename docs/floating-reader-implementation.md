# Float Reader implementation and validation

October 22, 2026, updated November 3, 2026 for the macOS port and performance work. Governing
specification: [floating-reader-prd.md](floating-reader-prd.md).

This standalone repository contains the Rust/Tauri [Float Reader implementation candidate](../README.md).
It is independently authored and uses the proposed rendering libraries. **M0 has not exited and this
is not a P0-complete release.** The released Readest/SumatraPDF comparison has not been performed.
The engine decision remains provisional.

The app now builds and runs on both Windows and macOS. Performance has been measured on macOS (see
[floating-reader-performance.md](floating-reader-performance.md)); the PRD resource budgets are still
not claimed as achieved, because idle CPU, cold launch and stress corpora remain unmeasured.

## Implemented candidate

- Compact document-first interface, accessible named controls, visible focus, menu and shortcut reference; 420 × 620 and 760 × 900 outer-window presets.
- Native Open dialog, authorized native drops/CLI/second-instance requests, up to 20 recents, per-user local saved state, fingerprint identity and revision warnings. Source documents are read-only.
- Native pin and size-lock commands with client/outer-size conversion, constraints, maximize disabling, OS resize correction and work-area recovery. Lock and pin are independent.
- PDF.js single-page rendering with selectable text, page geometry, page labels, internal links, zoom, fit modes, rotation, password callback, bounded active surfaces and stale-result rejection. The page paints as soon as it has pixels, with the text layer and links layered on afterwards; a bounded page-bitmap cache with idle neighbour prefetch makes repeat page turns a blit rather than a re-render.
- foliate-js EPUB spine rendering, reflow/fixed-layout modes, TOC, internal links/Back, CFI anchors and content-weighted approximate position. Script execution is removed from the renderer's frame sandbox before bundling. Content is sanitized before frame load and receives its own restrictive resource policy.
- Markdown tables, task display, strikeout, fenced code and outline. Raw HTML is disabled. Relative images are authorized by the native backend; network/out-of-scope images become placeholders.
- Strict UTF-8 and BOM-marked UTF-16 decoding, text wrapping, source-line jumps, typography and semantic text anchors.
- Format-specific position footer, bounded Back stack, save debounce/continuous-save interval, atomic native state replacement, unreadable-state backup and explicit save failure UI.

## October 23 PDF resize-loop correction

- Report: a screen recording showed page 4 of a long (200+ page) PDF repeatedly refitting while the scrollbar and loading notice alternated.
- Cause: the sticky loading notice participated in document flow. On the real PDF, adding it increased scroll height from 656 to 691 CSS pixels, creating overflow and feeding the resize observer.
- Fix: loading and retry notices are positioned outside page flow, anchored inside the current visible scroll region. PDF rendering, page navigation and resize handling remain enabled.
- Verification: the same PDF's loading geometry now stays at 656 pixels and its canvas remains unchanged while idle. Both PDF browser regressions pass, including fit-page and scrolled fit-width geometry, visible loading notices, idle stability, mixed-page navigation and internal-link history.


## Validation evidence

Automated tests are intentionally narrower than the PRD acceptance corpus. Passing them does not establish all supported-publication fidelity or a performance claim.

| Check | Evidence |
| --- | --- |
| Frontend type check and bundled production build | Pass; local PDF auxiliary resources copied during build |
| Markdown/TXT unit tests | 41 passing: strict decoding, path/link filtering, raw HTML, tables/tasks, outline, jumps, history and disposal |
| EPUB security unit tests | 12 passing: resource filtering, active-content removal, fixed viewport preservation and unsupported-media placeholders |
| Library model unit tests | 5 passing: collection/document mutation rules |
| Native Rust checks | Compilation and 23 tests pass: unreadable-state backup, last-good atomic write, recents retention, file bounds, image confinement, catalog migration/rollback, folder indexing, and the macOS outer/client window-size conversion |
| Browser shell tests | Text source-line jump/resume after reload, invalid replacement preservation, invalid Go to, safe Markdown, outline and minimum-size controls pass |
| Real-browser anchor checks (`npm run test:layout`) | 8 passing: TXT source line 333 stays anchored through font/margin changes, resize and reopen; Markdown heading anchor survives typography and minimum-size resize |
| PDF/EPUB browser fixture checks (`npm run test:e2e`) | 6 passing: mixed-page PDF, reflowable EPUB and fixed EPUB, including script/network probes and EPUB font/resize/reopen. Synthetic fixture SHA-256 manifests are attached to test results. |
| Standalone Windows build | Optimized custom-protocol executable plus WebView2Loader.dll built successfully. Real WebView2 smoke test passes: embedded UI, command-line file opening, native IPC, pin/lock toggles, source-line jump, save and clean close. Unsigned. |
| Standalone macOS build | arm64 `.app` (~9.5 MB) built via `npm run package:macos` with a generated `.icns` and an ad-hoc signature; `plutil -lint` and `codesign --verify --strict` pass. Launches with a file argument, stays alive, logs no panic and no crash report, exits cleanly on SIGTERM. Unsigned and not notarized. |
| Native OS behavior and assistive technology | Basic native commands smoke-tested; actual stacking above other apps, every snap/resize route, multi-monitor and Narrator acceptance remain unverified |

The browser rules that make the suite platform-neutral (browser discovery, native binary paths, the
CDP/automation capability split) live in `tests/browser/platform.mjs`. Windows CDP assertions run
only on Windows; macOS smoke tests verify launch, liveness and clean quit and state the skip reason.

Tests create small synthetic fixtures from checked-in source. There is no proprietary/user document corpus in Git. The standard and stress fixture manifest below must be populated and checksum-frozen before benchmarks.

## Release gates and known gaps

1. **M0 comparison and measurements:** hands-on released Readest/SumatraPDF comparison; standard/stress fixtures; launch/open/navigation/CPU/process-tree memory/GPU/package measurements. No performance target has been waived or claimed achieved.
2. **Large documents:** the native candidate reads and hashes the whole file; document bytes now travel as raw octet-stream IPC (no JSON number array), but a full copy still crosses the WebView2 boundary per open and the read occupies a background task without chunked transport. TXT currently creates a DOM block per line; EPUB position indexing traverses the spine. Replace/measure these before accepting PERF-02/05/06 on stress files. Native reads are bounded at 300 MiB, image reads at 20 MiB, EPUB resources at 64 MiB and declared total archive content at 512 MiB. Those are candidate guardrails, not PRD release limits.
3. **Cancellation:** the UI cancels/discards a replacement and preserves the active document, but a native file read/hash already underway continues in its background task. Add cancellable/ranged transport before claiming the full slow-read contract.
4. **Windows:** measure lock tolerance for every drag/snap/maximize/restore route, pin without focus theft, monitor removal, work-area shrinking and logical dimensions at 100/150/200% scaling. Native code implements these paths; runtime acceptance remains open.
5. **Format corpus:** verify encrypted/scanned/large PDF, embedded fonts/images, EPUB 2/3, RTL, footnotes, fixed-layout books and malformed archives against expected visible content. PDF form/XFA interactions and multimedia are not supported by this candidate. EPUB fixed-layout 90° rotation is not implemented. EPUB font obfuscation/encryption cases need corpus validation. Markdown source-line mapping inside complex blocks is approximate.
6. **Progress/data:** repeat 20 anchors per reflowable format across all prescribed changes, forced termination and denied storage. Per-document typography exists; global typography defaults for new documents remain to be added. Browser preview storage is a test convenience, not the desktop durability implementation.
7. **Accessibility:** keyboard smoke checks pass; Narrator reading order and control states, high-DPI contrast/fit and text-layer semantics require Windows testing.
8. **Opening/history:** missing recents explain how to use Open and support Remove; a dedicated Locate action is still needed. Test simultaneous/rapid open routes and failed replacements with production fixtures.
9. **Packaging:** create and test the Windows installer on a clean account, verify Open With registration does not take defaults, WebView2 prerequisite flow, offline reopening, signing/distribution policy and complete transitive license notices. The GNU linker emits a duplicate-resource-manifest warning; the executable launches and passes the native smoke test, but manifest/DPI behavior needs review before distribution. Keep WebView2Loader.dll beside the unsigned executable.
10. **macOS:** the build and launch path works, but window contents, DPI behavior, pin/always-on-top stacking, menu-bar integration, VoiceOver reading order and the `.dmg` have **not** been verified — the current verification environment has no window server session and no automation permission. macOS is also unsigned and not notarized, so Gatekeeper requires a right-click → Open on first launch. See the [macOS and performance audit](floating-reader-macos-and-performance-audit.md).
11. **Reading anchor on resize (defect, open):** resizing the window while reading Markdown or TXT can permanently move the reader from its current position (reproduced at source line 333 → 665, failing 7 of 15 runs on the unmodified code). The mechanism is a `ResizeObserver` event dropped while `restore()` is in flight. Four candidate fixes were measured and all failed to beat the baseline, so the code is unchanged and the defect is documented with its reproduction in the audit. This blocks POS-04 for reflowable formats.

## Reproducible acceptance work

Run the commands in [README](../README.md). Record observations without interpreting unmeasured values as passes. The next engineering work should address the resize-anchor defect above, then chunked/ranged byte transport and large-text rendering while building the corpus, followed by native window/accessibility acceptance. P1 features are deliberately not added to expand the scope.

| Fixture ID | Required class | State |
| --- | --- | --- |
| standard-pdf | ~100 pages, ≤10 MiB, text PDF | Awaiting redistributable/user-owned corpus selection |
| standard-epub | ≤5 MiB DRM-free reflow EPUB | Awaiting corpus selection |
| standard-md | ≤1 MiB tables/code/images | Awaiting corpus selection |
| standard-txt | ≤5 MiB Unicode text | Awaiting corpus selection |
| stress-scan | ~250 MiB scanned PDF | Awaiting corpus selection |
| stress-magazine | Image-heavy magazine PDF | Awaiting corpus selection |
| stress-pages | 1,000-page text PDF | Awaiting corpus selection |
| stress-txt | 50 MiB TXT | Awaiting corpus selection |
| stress-epub | Large illustrated EPUB | Awaiting corpus selection |

For every frozen fixture, record SHA-256, byte size, physical page/spine counts, expected visible features, license/source and expected anchor locations. For every run, record CPU/RAM/OS/WebView2/renderer versions, display/scaling, power mode, window size and hydration state. The PRD's full acceptance matrix remains authoritative.
