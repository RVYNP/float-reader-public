Hold My Brief — product requirements document

Version 1.0 · October 22, 2026 · Status: specification for implementation planning

Hold My Brief is the product name; this document was drafted under the working name Float Reader. The product is a compact desktop reader for PDF, EPUB, Markdown, and plain text. It stays visible beside other work, supports quick keyboard navigation, preserves the reader's place, and can lock its window dimensions. The first release prioritizes dependable reading and low resource use.

This document defines the product to build and how to verify it. It does not claim that an application, prototype, or benchmark already exists. It incorporates the [research brief](floating-reader-research-2026-10-22.md) and independent product and technical reviews. The research remains the source for comparisons and implementation candidates; the requirements below govern product behavior.

The user needs to keep reading material beside their work without repeatedly bringing a large viewer forward, resizing it, or finding their place. Success means opening a file, arranging the window once, navigating comfortably, and returning to the same passage later. Pinning, size locking, navigation, and progress must remain usable in the compact window.

The confirmed requirements and proposed defaults are distinct:

| Decision | Requirement or default | Basis |
| --- | --- | --- |
| Formats | PDF, EPUB, Markdown, and plain text in the first release | Explicitly confirmed by the user |
| Window controls | Always-on-top, free resizing, and a size lock | Explicit user requirement |
| Navigation | Keyboard shortcuts for changing pages | Explicit user requirement |
| Telemetry | Show where the reader is in the document | Explicit user requirement; this PRD calls it Reading progress |
| Performance | Lightweight enough to keep open beside other work | Explicit user requirement; measurable targets below are proposed |
| Language | Rust is preferred if suitable | User expressed a preference, not a pure-Rust constraint |
| Platform | Windows 11 x64 first | Proposed from the user's current environment |
| Document model | One reader window and one active document, plus recent files | Proposed to keep the initial product small |
| Storage | Local files and local reading state; source files remain unchanged | Proposed default |
| Additional analytics | Session timers and time estimates are later enhancements | Position telemetry is sufficient for the confirmed first-release requirement |

P0 means required for the first release. P1 means a specified follow-on enhancement, not a first-release blocker. Deferred features have no implementation commitment. A renderer demonstration or a PDF-only version does not meet this PRD's release definition.

The core journeys are:

1. Open a local file through Open, drag-and-drop, or Open With. See the document and its position, or a useful loading/error state.
2. Resize the reader, pin it above ordinary application windows, and lock its dimensions. Move it without changing its size.
3. Turn pages or scroll with predictable shortcuts. Jump directly to a page, chapter, or line appropriate to the format.
4. Close and reopen the file, or resize and change typography, while retaining the same content location.
5. Inspect current position without confusing it with material actually read or a finished state.

The initial interface has a compact title bar with Open, filename, Pin, Lock size, and a menu. The reading surface takes the remaining space above a single progress footer. Secondary controls can move into the menu at narrow widths. Pin, Lock, their state, and the menu remain accessible. No bookshelf, account screen, or onboarding sequence is required before opening a file.

Start at 420 × 620 logical pixels. Offer a Reading preset at 760 × 900 and a minimum usable size of 360 × 420. These dimensions describe the outer window and are design defaults to verify on the reference displays. On a smaller available work area, fit the window within the work area. An empty state shows Open file, supported formats, and recent files. First launch starts unpinned and unlocked; later launches restore the chosen window settings.

The following format and opening requirements are P0.

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| OPEN-01 | Open a local document | Open dialog, single-file drop, command-line file argument, and Windows Open With all open a supported file. Registration offers Open With without taking over system defaults automatically. Opening a second file saves the first file's position before replacement. |
| OPEN-02 | Keep useful loading states | Show the filename and loading state within 200 ms of accepting an open request. A slow read can be cancelled and the window remains responsive. A cancelled or failed replacement preserves the currently open document. |
| OPEN-03 | Recent files | Retain up to 20 entries with filename, location, format, and last-opened time. A missing file offers Locate file or Remove from recents. Removing an entry does not delete the file or its stored position. |
| FMT-01 | Render PDFs faithfully | Preserve page geometry, orientation, images, and text placement. Support text PDFs, scanned PDFs, mixed page sizes, and password-protected PDFs. Offer fit-page, fit-width, zoom, and temporary 90-degree rotation. Password entry can be cancelled and is not persisted. |
| FMT-02 | Read DRM-free EPUB 2/3 | Follow the publication spine; expose its table of contents; preserve supported images, embedded fonts, lists, links, and footnotes. Reflowable books allow text size, line spacing, and margin changes. Fixed-layout books preserve pages and use fit/zoom controls. Validate both layouts; text extraction alone is insufficient. |
| FMT-03 | Render Markdown | Support CommonMark plus tables, fenced code, task-list display, and strikethrough. Provide a heading outline. Long code and tables scroll within their own region. Display local relative images within the document's authorized directory tree; missing or out-of-scope resources show a placeholder. Raw HTML is disabled in v1. |
| FMT-04 | Read plain text | Support UTF-8, UTF-8 BOM, and BOM-marked UTF-16 LE/BE, Unicode, LF and CRLF. Provide wrapping and adjustable font size. Unsupported or invalid encodings produce a clear message without silent replacement of undecodable content. |
| FMT-05 | Preserve navigation within content | Internal EPUB links and footnotes navigate within the document; a Back action returns to the prior location. PDF internal links work when supplied by the renderer. External web links open in the system browser only after an explicit user click. |
| FMT-06 | Make limitations understandable | An image-only PDF remains viewable; text-only operations are unavailable with an explanation. DRM-protected EPUBs and unsupported formats receive specific messages. Unsupported embedded media shows a placeholder without preventing the surrounding document from opening. |

PDFs and fixed-layout EPUBs open in single-page fit-page mode by default. Fit-width allows vertical scrolling within the current page. Reflowable EPUBs open in paginated, single-column mode. Markdown and text open in scrolling mode. Preferences are saved per document, with global typography defaults for newly opened reflowable documents. Full continuous multi-page PDF scrolling and two-page spreads are P1.

EPUB coverage in v1 includes ordinary static publications, basic bidirectional text, and the fixed-layout corpus. Scripted books, embedded audio/video playback, vertical writing, and uncommon interactive EPUB features are deferred. The interface must not claim complete EPUB specification conformance. Rendering correctness is assessed against the agreed corpus, with supported content never silently omitted.

Window behavior is a primary feature, with these P0 contracts:

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| WIN-01 | Pin independently of size lock | Pin applies to the main window immediately and has a visible, accessible on/off state. Switching to an ordinary non-topmost application leaves the reader visible without stealing focus. Unpin restores normal stacking. Minimize and close continue to work. |
| WIN-02 | Resize freely when unlocked | Edge/corner dragging and the two presets work when unlocked. Text reflows and pages refit without losing the current anchor. Controls do not overlap or become unreachable at minimum size. |
| WIN-03 | Lock dimensions | Lock captures current outer width/height in logical pixels. Edge/corner dragging, maximize, title-bar double-click, window presets, and application resize commands cannot change them. Moving, minimizing, pinning, reading, zooming, changing fonts, and opening another file remain available. |
| WIN-04 | Make unlocking reliable | Unlock is always available through the menu and Ctrl+Shift+L, even at minimum size. The lock state is visible independently of the pin state. Presets explain that size is locked instead of silently failing. |
| WIN-05 | Handle Windows window commands | Verify Win+Arrow snapping, keyboard maximize, restore, and title-bar behavior while locked. Preserve locked dimensions to within one logical pixel after settling. Do not ship a size-lock control that only prevents pointer dragging. |
| WIN-06 | Restore and recover the window | Persist position, dimensions, pin, and lock. Restore on the saved monitor when available; otherwise place the window in a visible work area. Maintain logical size across display-scale changes where it fits. |
| WIN-07 | Resolve work-area conflicts | If a display change makes the locked window too large, shrink it only as necessary, keep it visible, retain the lock at the recovered size, and show a nonmodal explanation. This is the documented exception to the lock. |

Always-on-top follows normal Windows behavior; it does not promise precedence over other topmost windows, secure desktop prompts, or exclusive fullscreen applications. A pinned window remains an interactive application. Click-through and position locking are deferred and must not be implied by the size-lock control. [Microsoft's topmost behavior guidance](https://learn.microsoft.com/en-us/windows/powertoys/always-on-top)

Navigation has separate Page and Screen actions. Page changes the physical page in fixed-layout documents, the displayed page in paginated EPUB, or approximately one viewport in scrolling text. Screen traverses scrolling content with overlap, including within a zoomed fixed page; in paginated EPUB it turns one displayed page. This distinction prevents a tall PDF page from being skipped when using Space.

| Action | P0 default | Defined behavior |
| --- | --- | --- |
| Next / previous page | PgDn / PgUp | Fixed page or paginated EPUB page; one viewport with 10% overlap in scrolling Markdown/TXT |
| Next / previous page in page mode | Right / Left | Same page action when the reading surface has focus; not when a horizontal scroll region or editor has focus |
| Forward / back one screen | Space / Shift+Space | Paginated EPUB: turn one displayed page. Scrolling content: move 90% of usable viewport height. Fixed pages: reach the bottom/top of the current page before a subsequent press advances to an adjacent page; if the whole page already fits, advance immediately. |
| Scroll within content | Up / Down | Scroll the active reading or focused scroll region |
| Go to location | Ctrl+G | Physical page number for fixed layouts; chapter or percentage for reflowable EPUB; source line for Markdown/TXT |
| Back after explicit jump | Alt+Left | Return after a TOC, internal-link, footnote, or Go to jump; retain up to 20 locations for the current document |
| First / last location | Home / End | Start/end of document when the reading surface has focus |
| Open | Ctrl+O | Open file dialog |
| Pin | Ctrl+Shift+T | Toggle pin |
| Lock dimensions | Ctrl+Shift+L | Toggle size lock |
| Fit page / fit width | Ctrl+0 / Ctrl+2 | Fixed-layout formats only |
| Zoom or font size | Ctrl+Plus / Ctrl+Minus | Fixed-layout zoom or reflowable text size; available through the menu as well |
| Dismiss | Escape | Close a popup/dialog; never exit the app or silently unlock |

NAV-01: Every shortcut has an equivalent visible control or menu item. The shortcut reference is available from the menu. Local rebinding is P1; defaults must be tested for conflicts with the chosen rendering engine.

NAV-02: Navigation never intercepts typing or editing shortcuts in password, Go to, or settings fields. Keyboard focus stays visible and returns to the reading surface when a dialog closes. At document boundaries, navigation is a harmless no-op with a visible position indicator. Go to rejects out-of-range values without moving.

NAV-03: Rapid page commands cannot show a newer position label beside an older page. Render results carry document/location identity; stale work is discarded. While waiting for a new page, show a loading state with the target location. Render failure retains the last valid position and offers Retry.

Reading progress is P0; reading-time analytics are not required to satisfy it. Use the label “Position” or “Reading progress.” Avoid claiming that the percentage measures comprehension or the proportion actually read.

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| POS-01 | Show format-appropriate position | PDF/fixed EPUB: physical page and total. PDF: also show the printed label when present and different. Reflowable EPUB: current chapter and approximate whole-book percentage. Markdown: current heading and approximate percentage. TXT: source line and approximate percentage. Details remain available when the narrow footer abbreviates them. |
| POS-02 | Define percentage consistently | Fixed-layout position uses physical page index plus normalized within-page location. Reflowable/text position uses a stable content-location map independent of window size and font size. Calculate book progress by content positions, not by giving each chapter equal weight. Display reflowable percentages as approximate and do not show fake print pages. |
| POS-03 | Persist a content anchor | PDF stores physical page, normalized page region, rotation, and zoom mode. EPUB stores spine resource and a CFI or equivalent text anchor with progression fallback. Markdown/TXT store a source/block or character anchor with nearby text context. Pixel scroll offset alone is insufficient. |
| POS-04 | Preserve place through changes | At unchanged geometry, scrollable fixed layouts restore the same page and viewport anchor within 5% of viewport height. After resize, the saved page region remains visible; fit-page mode restores the correct page with that region visible. Paginated reflow restores the page containing the saved text anchor, wherever that anchor lands in the new pagination. Scrolling reflow places the anchor within the first 20% of the viewport where scrolling permits. Repeat after reopen, resize, font, margin, and display-scale changes; document-edge clamping is allowed. |
| POS-05 | Save without blocking reading | Persist settled position within one second of the last navigation change and at least every two seconds during continuous movement. Flush on ordinary close or document replacement. Unexpected termination loses no more than the latest two seconds of committed navigation, excluding storage failure. |
| POS-06 | Separate position from completion | Opening or jumping to the last page never marks a book finished or all prior pages read. V1 exposes position and resume only. Any future finished flag or coverage metric is separate from current/furthest location. |
| POS-07 | Recognize identity carefully | Reopening identical bytes through a renamed or relocated file recovers matching state. Two different files sharing a name never share state. Detect changed bytes at the same path; use a best-effort anchor and explain if exact restoration is unavailable. Never overwrite the previous revision's state before recording the new identity. |

For fixed layouts, the canonical progression is `(zero-based page index + within-page fraction) / page count`; the renderer defines the normalized leading visible position, and an explicit end-of-document location maps to 100%. A whole-page view can therefore show page 1 with 0% position. The footer labels this as position, not pages completed. Printed page labels may be Roman numerals, nonnumeric, or duplicated; Go to uses unambiguous physical page numbers in v1.

**October 23 addition — document scrubbing:** the footer exposes an accessible slider spanning the whole file. Click to seek; dragging previews the target and seeks on release rather than rendering every intermediate position. PDFs and fixed-layout EPUBs use integer physical pages, Markdown/TXT use source lines, and reflowable EPUB uses content-weighted percentage. Keyboard arrows move one slider step; Home/End reach the endpoints. A page slider spans page 1 through the final page, independently of the canonical within-page position percentage above. No-file and single-location sliders are disabled. Loading a different document resets the range, and stale seek completions must not overwrite its controls.

EPUB locators should follow established content-addressing practices. Readium distinguishes a resource, location, progression, and text context, which supports restoring content across layout changes. [Readium locator model](https://readium.org/architecture/models/locators/)

Identity checks must not block first content unnecessarily. A provisional path/size/mtime record may be used while a content fingerprint completes, but state from a different revision cannot be silently merged. This is an engineering design choice to validate with large files during the prototype.

The following reliability and accessibility requirements are P0:

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| REL-01 | Keep core reading local | Opening, rendering, position storage, and window controls work without a network connection. No account, cloud upload, analytics service, or remote font/CDN is required. Reading data stays local. |
| REL-02 | Preserve source files | Viewing, zooming, rotating, and recording progress never modify the source document. State is stored in a per-user application-data directory, separate from the source documents and this repository. Reading works from a read-only source folder. |
| REL-03 | Isolate document content | Document scripts and automatic external-resource requests are disabled. Rendered document content cannot invoke native application commands. File/archive reads stay within authorized resources; malformed or oversized resources fail without uncontrolled extraction or allocation. |
| REL-04 | Recover from file and storage errors | Handle corrupt files, access-denied paths, unavailable/cloud-placeholder files, wrong passwords, and changed/deleted open files without a crash. Storage failures show “Progress could not be saved” with Retry; reading remains available and unsaved state remains in memory. |
| REL-05 | Make saved state durable | State writes are transactional or atomic. A failed write does not corrupt the last good state. If state is unreadable, preserve it for recovery and explain the fallback; do not silently overwrite it. |
| REL-06 | Avoid duplicate writers | Opening another file through Windows routes to the existing application instance. The last requested successful open becomes active. Position writes remain ordered per document. |
| A11Y-01 | Support keyboard operation | Every app control is reachable with visible focus, has an accessible name/state, and works without a pointer. Dialogs have predictable focus order and return focus on close. Verify with Windows Narrator, not visual inspection alone. |
| A11Y-02 | Remain readable | UI text and essential controls meet a 4.5:1 text contrast target, scale with the OS, and remain usable at 100%, 150%, and 200% display scaling. Pinned/locked state uses text or icon state as well as color. |
| A11Y-03 | Preserve available text semantics | Reflowable reading content exposes a usable reading order. Keep an available PDF text layer instead of reducing text PDFs to images only. Scanned PDFs are visibly supported but OCR and comprehensive tagged-PDF conformance are outside v1. |
| DATA-01 | Give control of local history | Provide separate actions to clear recents and delete saved reading data. Explain what will be removed; never delete documents. No hidden network telemetry is added to measure product success. |

The P1 backlog is ordered by usefulness to the floating-reader workflow:

| ID | Enhancement | Acceptance boundary |
| --- | --- | --- |
| NEXT-01 | Optional global page shortcuts | Off by default. User enables and assigns modified shortcuts, initially Ctrl+Alt+PgDn/PgUp. Act on the single active document without stealing focus. Pause operation during document dialogs and loading. Report registration failures; never claim an unsuccessful binding is enabled. Do not register bare arrows/Space. Unregister on disable/exit. |
| NEXT-02 | Search, copy, and bookmarks | Search text where it exists; explain absence of a text layer. Copy selection, save named bookmarks, and return to exact locations. Store these separately from originals. |
| NEXT-03 | Explicit session timer | Start/Pause/Resume controls. Losing focus alone does not pause; minimizing, hiding, system lock/sleep, document replacement, or five minutes without reader activity pauses. Global page changes count as reader activity. Resume is explicit. Label the value Session time, not verified attention. |
| NEXT-04 | Reading flexibility | Continuous multi-page PDF scrolling, two-page spreads, reflowable scroll/page toggles, reading ruler, and light/dark/sepia reading themes. PDF recoloring must be optional so illustrations remain useful. |
| NEXT-05 | Customization and export | Rebind local shortcuts with conflict validation; export local progress/bookmarks as a versioned file. Imports validate identity and do not replace newer state silently. |

Time-to-finish, automatic reading speed, daily calendars, completion heatmaps, cloud sync, OCR, DRM, annotations written into PDFs, AI features, reference portals, tabs/multiple reader windows, a library manager, and mobile/macOS/Linux versions are deferred. An existing renderer may supply extra capabilities, but their presence does not expand the first-release acceptance contract.

The recommended engineering candidate is Rust/Tauri with a small frontend, PDF.js for PDF, foliate-js for EPUB, and a sanitized Markdown/text surface. Rust owns window commands, authorized file access, identity, and persistence. Each format adapter exposes open, render, navigate, get/restore locator, outline, and position reporting through a common reader interface. Rendering runs outside blocking UI operations and uses bounded caches.

This choice is provisional until the first milestone. Tauri uses the operating system's webview and has a multi-process runtime; it does not establish a low memory footprint by itself. Native Rust with egui/PDFium remains the fallback candidate if measurements justify the extra EPUB and accessibility work. A pure-Rust engine is not a product requirement. [Tauri architecture](https://v2.tauri.app/concept/architecture/), [process model](https://v2.tauri.app/concept/process-model/), [PDF.js](https://mozilla.github.io/pdf.js/), [foliate-js](https://github.com/johnfactotum/foliate-js)

Use established libraries and an independently authored interface. Readest is a behavioral and evaluation reference; a direct application fork is not assumed. Capture library versions and distribution notices in the engineering design. Version upgrades must repeat the rendering and position-regression corpus.

“Lightweight” is a measured release property. The targets below are proposed engineering budgets, not achieved results. The first milestone validates them against named hardware and records any necessary revision before full implementation. Failing a target requires an explicit documented product/architecture decision; it must not be quietly removed.

| ID | Measurement | Proposed release target |
| --- | --- | --- |
| PERF-01 | Cold launch to interactive shell | 95th percentile ≤2 seconds over 20 application launches; distinguish warm OS cache from a rebooted run |
| PERF-02 | Ordinary local file to first usable content | 95th percentile ≤1 second after Open in a running app for the standard corpus; a large-file loading state is covered by OPEN-02 |
| PERF-03 | Navigation latency | 95th percentile ≤100 ms for cached pages over 100 transitions; ≤500 ms for uncached standard-corpus pages |
| PERF-04 | Idle CPU | ≤0.5% total-system CPU for the app process tree averaged over 60 seconds after all loading/saving settles; no continuous animation/repaint loop |
| PERF-05 | Settled memory | Provisional ceiling: 250 MiB process-tree private bytes on the standard corpus; 512 MiB on the stress corpus. Record peak and settled memory and GPU usage separately. Do not compare one process against a competitor's whole tree. |
| PERF-06 | Session growth | After 500 forward/back transitions and 20 document switches, settled private bytes remain within max(10%, 20 MiB) of the comparable warmed baseline; cache sizes have explicit bounds |
| PERF-07 | Package footprint | App payload ≤50 MiB, excluding the shared WebView2 prerequisite. Report installer, installed app, and missing prerequisite download separately. |

Reference testing uses a recorded Windows 11 x64 machine with at least four CPU cores, 8 GB RAM, SSD storage, and a 1920 × 1080 display. Record the exact CPU, RAM, OS build, WebView2/renderer versions, power mode, window size, scaling and file checksums. Use locally hydrated files. Measure the standard budgets at 100% scaling, then repeat at 150% and 200% to document high-DPI behavior; the stress ceiling applies to those higher-scale checks. GPU memory is reported separately because it is not included in private bytes. A pending cloud download is reported separately from renderer time.

Build a versioned fixture manifest before benchmarks. Standard fixtures: a text PDF of roughly 100 pages and ≤10 MiB; a DRM-free reflowable EPUB ≤5 MiB; a representative Markdown file ≤1 MiB with tables/code; and a TXT file ≤5 MiB. Stress fixtures: a scanned PDF around 250 MiB; an image-heavy magazine; a 1,000-page text PDF; a 50 MiB TXT; a large illustrated EPUB. Use redistributable or user-owned fixtures and keep generated/heavy media out of Git. Size and page counts identify test classes, not promised limits on all real-world documents.

Memory must scale primarily with active rendering work rather than every rendered page visited. Render visible pages, bound neighbor prefetching and image decode dimensions, evict unused surfaces, and discard obsolete requests. Confirm that the old document releases its rendering resources after replacement. Mozilla specifically recommends limiting rendered canvases to visible pages. [PDF.js memory guidance](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)

The acceptance suite combines functional fixtures and user journeys:

| Scenario | Required evidence | Requirements covered |
| --- | --- | --- |
| Pin while working elsewhere | Reader stays over a normal app after focus changes, including while size-locked; no focus theft | WIN-01, WIN-03 |
| Lock every resize route | Drag edges/corners, title-bar double-click, maximize, Win+Arrow, presets, restore and unlock; dimensions recorded | WIN-02–WIN-05 |
| Monitor and scaling changes | Move between 100/150/200% displays; disconnect saved display; recover a too-large locked window | WIN-06–WIN-07, A11Y-02 |
| Resume under reflow | Test 20 text anchors per reflowable format across compact/reading sizes, font/margin changes and reopen; verify mode-specific visibility/tolerance | POS-03–POS-05 |
| PDF position correctness | Roman labels, duplicate labels, mixed page sizes, rotation, long-page fit-width; physical-page jumps | FMT-01, POS-01–POS-04 |
| EPUB fidelity | EPUB 2/3, reflowable/fixed, image/embedded-font/footnote/table/RTL cases; compare expected visible content | FMT-02, FMT-05–FMT-06 |
| Markdown/TXT reading | Tables/code/images, long lines, Unicode, BOM encodings, LF/CRLF, invalid encoding | FMT-03–FMT-04 |
| Fast input and errors | Rapid navigation, invalid Go to, document replacement during rendering, wrong password, cancel, corrupt/missing file | OPEN-02, NAV-02–NAV-03, REL-04 |
| Persistence and identity | Normal close, forced termination, denied writes, identical renamed file, different file at same path | POS-05–POS-07, REL-05–REL-06 |
| Offline and read-only | Open all formats offline, inspect network activity, compare source checksums, test read-only source directory | REL-01–REL-03 |
| Accessible compact workflow | Open, navigate, pin, lock, change format and close using keyboard and Narrator at minimum size | A11Y-01–A11Y-03 |
| Resource behavior | Reproducible benchmark report with raw observations and environment metadata | PERF-01–PERF-07 |

Implementation proceeds through evidence-based milestones, with no calendar or staffing commitment implied:

| Milestone | Deliverable | Exit condition |
| --- | --- | --- |
| M0 — Confirm approach | Evaluate released Readest and SumatraPDF against the core journey; test a minimal candidate rendering/window prototype; record versions, corpus and measurements | Evidence supports reuse/custom build and the engine choice. All four formats render in the candidate. Pin/size lock and proposed resource budgets are proven feasible or revised with a documented rationale. |
| M1 — Reader foundation | File opening, format adapters, window controls, keyboard navigation and loading/error states | OPEN, FMT, WIN and NAV acceptance cases pass on the fixture corpus; no format is represented by an empty or text-only substitute. |
| M2 — Reliable progress | Position footer, semantic resume, identity handling, durable local state, offline behavior and accessible controls | POS, REL, DATA and A11Y acceptance cases pass, including crash/reopen and resize/reflow tests. |
| M3 — Release candidate | Packaged Windows app, first-run prerequisite handling, benchmark report, concise user guide and known limitations | All P0 cases and agreed performance budgets pass; no unresolved crash, data loss, wrong-location display, missing supported content, or unusable pin/lock control. Installation and offline reopening verified on a clean Windows account. |

Product validation uses a short observed session: the reader can open each format, arrange/pin/lock the window, navigate without the pointer, identify the current position, and reopen at the same passage. The user should complete each task without an explanation from the developer. Record obstacles and corrections locally; no production analytics service is required.

The working name, initial dimensions, Windows-only scope, proposed performance budgets, and backlog order are defaults that can be revised during planning. They do not block writing or reviewing this PRD. Renderer selection and final resource budgets are resolved at M0; the four requested formats and core window/progress behaviors remain required. Search, session timing, and global shortcuts should only move into P0 through an explicit scope change.
