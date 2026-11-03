Floating reader: research and recommended product direction

Research date: October 22, 2026. Platform assumption: Windows first. Required formats: PDF, EPUB, Markdown, and plain text.

The strongest direction is a small floating reader that preserves your place across window sizes and makes pinning, size locking, navigation, and progress visible. Rust is suitable. For all four formats, my provisional recommendation is a Rust/Tauri desktop shell with established document engines. A native Rust interface remains a candidate if measured memory use is the overriding constraint.

Before developing a new app, evaluate Readest against the actual workflow. It already covers much of the brief, including an always-on-top setting. A custom build is justified by the remaining interaction and performance gaps, rather than by the ability to open PDFs alone.

This is a documentation and source review, not a hands-on performance comparison. No reader was installed, no document-rendering benchmark was run, and no application code was created. Features below are documented or source-verified; design proposals and performance targets are explicitly recommendations. Default-branch features may differ from the installed stable release.

The most useful existing products

| Reference | Verified capabilities or approach | Inspiration for this reader | What still needs evaluation |
| --- | --- | --- | --- |
| [SumatraPDF](https://www.sumatrapdfreader.org/docs/SumatraPDF-documentation) | Windows reader supporting PDF, EPUB and several other formats. Its [shortcut reference](https://www.sumatrapdfreader.org/docs/Keyboard-shortcuts) includes page changes, go-to-page, fit modes, navigation history, and hiding toolbars. | A document-first window; quick opening; predictable keyboard controls; minimal permanent chrome. | Use it as a performance baseline. Its documented format list does not establish the requested complete Markdown/TXT workflow or reading-session telemetry. |
| [Sioyek](https://sioyek.info/) | PDF reader aimed at technical books and papers. Includes keyboard navigation, searchable commands, location marks, a reading ruler, and portals that display another location in a second window. | Return to your previous place after following a reference; optional line guide; later, a temporary figure or footnote preview. | Primarily PDF-focused. Portals are useful inspiration, but would add complexity to a first release. |
| [Readest](https://github.com/readest/readest) | Tauri/Next.js reader whose repository lists all four requested formats. Its [reading guide](https://readest.com/docs/reading) describes page shortcuts, chapter/book progress, time estimates, reference page numbers, and hidden toolbars. | Closest functional reference and first existing app to evaluate. Borrow the compact progress footer and per-book reading settings. | Memory, compact-window usability, stable-release statistics, global shortcuts, and a true size lock need testing. |
| [KOReader](https://koreader.rocks/user_guide/) | Documents reading statistics, session/speed estimates, remaining time, calendar views, and a book map with page-level reading information. | Separate current position, history, and reading time; a useful footer with optional deeper detail. | A behavioral reference rather than the proposed Windows foundation. Detailed statistics should stay out of the small reading window. |
| [Thorium Reader](https://thorium.edrlab.org/en/) | EPUB/PDF support, configurable typography, keyboard navigation, screen-reader support, and Readium LCP support are described by EDRLab. | Visible keyboard focus, accessible control names, logical navigation order, and typography adjustments. | Accessibility should be tested with actual assistive technology. DRM/library support would expand our scope significantly. |
| [Koodo Reader](https://github.com/koodo-reader/koodo-reader) | Its published README lists many formats, reading statistics, bookmarks, notes, adjustable typography, and multiple reading layouts. | Useful secondary reference for a recent-files list and optional reading history. | Its broad library and plugin features exceed the small floating-reader brief. Resource use has not been compared. |

The Readest finding deserves particular attention. Its source has a persisted `alwaysOnTop` setting and a toggle in its [settings menu](https://github.com/readest/readest/blob/5273f82fc4730e70d4b91862e20f750ae978937d/apps/readest-app/src/app/library/components/SettingsMenu.tsx). Its [0.10.1 release notes](https://github.com/readest/readest/releases/tag/v0.10.1) also describe applying that state across windows and reader startup. Searches for `setResizable` and `lockWindow` did not return matches; that is insufficient evidence to claim size locking is absent.

Readest's README still labels advanced statistics as being built, while current documentation mentions statistics synchronization and the default branch contains a [ReadingStatsTracker](https://github.com/readest/readest/blob/5273f82fc4730e70d4b91862e20f750ae978937d/apps/readest-app/src/app/reader/components/ReadingStatsTracker.tsx). Treat the precise shipped statistics experience as unverified. This is a reason to test a release rather than infer completeness from marketing or repository descriptions.

A useful existing workflow for comparison is SumatraPDF with [PowerToys Always On Top](https://learn.microsoft.com/en-us/windows/powertoys/always-on-top). PowerToys pins the active window with Win+Ctrl+T and can show a border. This demonstrates the pinning workflow without writing a reader. It does not establish size locking or cross-format telemetry. Microsoft also notes that topmost windows can compete with other topmost windows; “always on top” should not be promised as overriding every possible system surface.

The proposed experience

Open a file directly into the last reading position. Keep a thin top bar with the filename, Open, Pin, Lock size, and a menu. Use a quiet footer with the position and percentage. A narrow window should hide secondary actions in the menu while keeping Pin and Lock discoverable and keyboard-accessible.

Offer two window presets initially: a small reference window around 420 x 620 logical pixels and a comfortable reading window around 760 x 900. These are starting design proposals, not validated dimensions. Resizing is free when unlocked. Lock size preserves the current dimensions while still allowing the window to move. Position locking and click-through are separate features and should not be implied by the same lock icon.

The lock must cover edge dragging, maximize controls, title-bar double clicks, and application resize commands. Windows snapping, display scaling changes, and monitor removal require explicit tests. Store logical dimensions and the target display; recover to a visible area if that display disappears. A menu and shortcut must always allow unlocking.

PDFs need fit-page and fit-width modes. In a narrow window, a whole textbook page may become unreadably small. Fit-width with scrolling should therefore be easy to reach. Preserve illustrations and original page layout. EPUB, Markdown, and text need adjustable type size, line height, and margins. EPUB has HTML/CSS/SVG content and supports both reflowable and fixed-layout publications, so simply extracting paragraphs does not fulfill faithful EPUB support. [EPUB 3.3 specification](https://www.w3.org/TR/epub-33/)

Proposed keyboard behavior:

| Action | Proposed shortcut | Behavior |
| --- | --- | --- |
| Next / previous page | PgDn / PgUp; Right / Left in page mode | Ignore reader bindings while a text field is being edited. |
| Scroll one screen | Space / Shift+Space | Scroll within a zoomed page before moving to another page. |
| Jump to location | Ctrl+G | Page for PDF; chapter, percentage, or location for reflowable formats. |
| Back after a jump | Alt+Left | Restore the former position after opening a reference or search result. |
| Pin / unpin | Ctrl+Shift+T | Show the resulting state in the top bar. |
| Lock / unlock size | Ctrl+Shift+L | Does not lock the window's position. |
| Fit page / fit width | Ctrl+0 / Ctrl+2 | PDF-specific, with menu alternatives. |
| Open / find / bookmark | Ctrl+O / Ctrl+F / Ctrl+B | Conventional, discoverable actions. |
| Turn a page from another app | Optional, remappable Ctrl+Alt+PgDn / PgUp | Use registered global shortcuts and report conflicts. |

Keeping a window visible does not give it keyboard focus. This distinction is central to a floating reader: normal shortcuts apply when it has focus; optional global shortcuts are needed to turn pages while working elsewhere. Tauri provides a [global-shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/). Do not register plain arrow keys or Space globally. The exact combinations above are proposals, not guarantees of availability on every machine.

Reading position and telemetry

Use “Reading progress” in the interface. The requested telemetry should be stored locally by default. There is no need for analytics uploads, an account, or a server to deliver the specified features.

| Material | Persistent location | Useful visible status |
| --- | --- | --- |
| PDF | File identity, physical page index, normalized within-page position, zoom mode and rotation | Printed label when available, physical page/total, and document position percentage |
| EPUB | Publication identity, spine resource, CFI or equivalent text anchor, fallback resource progression | Chapter, chapter progress, book progress, and publisher reference page when available |
| Markdown | File identity, source/block anchor, text offset and nearby context | Heading, document position, optional line reference |
| Plain text | File identity, character/line anchor and nearby context | Line or section and document position |

Readium's [locator model](https://readium.org/architecture/models/locators/) and [format-specific recommendations](https://readium.org/architecture/models/locators/best-practices/format.html) provide an established basis for storing positions. The implementation should preserve a content location when typography or window size changes. Raw scroll pixels and displayed page counts are insufficient for reflowable books.

Current position is not completion. Jumping to an index at the end must not mark a book as read. Keep the resume location, furthest position, and explicit finished state separate. Similarly, PDF printed page “12” may be physical page 28 because of front matter. Display both when that distinction matters.

The always-visible footer could show “Page 42 / 236 · 18% position.” A details panel could add current chapter, session time, today's estimated reading time, bookmarks, and an estimated time remaining. These examples describe proposed UI, not measurements.

Time needs careful semantics. A pinned page can remain visible while another application is focused, so focus alone is not a reliable reading signal. Recommend an explicit session timer, pause control, idle timeout, and a reference mode that does not count reading time. Automatic estimates should be labeled as estimates, exclude long idle intervals and rapid skimming, and initially withhold time-to-finish until enough observations exist. Scanned PDFs without text should not show invented word counts or reading speeds.

Use a document fingerprint plus file size/metadata to distinguish files, with a strategy for renamed and revised documents. Save position after meaningful movement with a short debounce, and on close. A small local database can store progress, bookmarks, sessions, and settings. Because documents often live in cloud-synced folders, the application's live database should be in its per-user local application-data directory; any backup/export can be a separate snapshot.

Rust architecture choices

| Approach | Strength | Cost or limitation | Assessment |
| --- | --- | --- | --- |
| Rust/Tauri + PDF.js + foliate-js + Markdown rendering | Reuses web document layout and mature reader components while Rust handles windows, files and state. | Uses WebView2 on Windows and multiple processes; small download size does not establish low RAM. | Best provisional fit for all four formats. |
| Rust/egui + PDFium + a separate EPUB rendering strategy | Native custom interface and direct control of rendering/cache behavior. | PDFium is a native dependency; complete EPUB layout, selection and accessibility require additional engineering. | Benchmark if minimum runtime resource use dominates. |
| Rust + Windows.Data.Pdf | Uses the operating system's PDF rendering API. | Windows-only; its documented page API centers on rendering and geometry, not a complete text-selection/search/navigation viewer. EPUB still needs another solution. | Viable for a narrow Windows PDF utility, weaker fit for the full reader. |
| Pure Rust PDF rendering with hayro | Avoids a C/C++ PDF engine. | Upstream explicitly calls it experimental and identifies rendering and performance limitations. | Evaluate later against a representative corpus; not the default first-release engine. |

Tauri's [architecture](https://v2.tauri.app/concept/architecture/) combines a Rust backend and an OS webview. Its [process model](https://v2.tauri.app/concept/process-model/) makes clear that it is not a single-process native widget toolkit. The proposed app would therefore be Rust-backed, with HTML/CSS/JavaScript for document presentation, rather than entirely written in Rust.

Its [window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) exposes topmost, resizable, size-constraint and maximize controls. These provide the building blocks for the requested behavior; the complete size-lock contract still needs platform tests.

[PDF.js](https://mozilla.github.io/pdf.js/) is the preferred PDF candidate for the Tauri route. Use its viewer infrastructure for text and annotation layers rather than treating every page as an isolated screenshot. [foliate-js](https://github.com/johnfactotum/foliate-js) is modular, supports EPUB and CFI handling, and does not require loading a whole publication into memory. Its own PDF adapter is explicitly experimental, so integrate PDF.js directly for PDF behavior. Markdown can render into a sanitized reading surface; text can use the same typography and anchoring system without converting the original file.

[egui](https://github.com/emilk/egui) supports native Windows interfaces, but it is not an EPUB browser engine. The Rust [epub crate](https://docs.rs/epub/latest/epub/) provides resource and spine access, not complete publication layout. [pdfium-render](https://docs.rs/pdfium-render/latest/pdfium_render/) is a Rust interface to PDFium and requires a separately supplied dynamic or static engine. “Written in Rust” does not make these document-rendering dependencies disappear.

Microsoft's [PdfDocument](https://microsoft.github.io/windows-docs-rs/doc/windows/Data/Pdf/struct.PdfDocument.html) supports loading documents, including password-protected files. Its [PdfPage](https://microsoft.github.io/windows-docs-rs/doc/windows/Data/Pdf/struct.PdfPage.html) exposes page geometry and rendering. My assessment is that choosing this API saves packaging work but creates additional work for a fully interactive reader. This revises the initial, pre-research proposal to use it as the main engine.

[hayro](https://github.com/LaurenzV/hayro) demonstrates that pure Rust PDF rendering is possible. Its maintainers explicitly describe remaining unsupported cases and performance work, so it should earn inclusion through tests rather than language preference.

For reuse, distinguish an application's license from its underlying libraries. Readest identifies its application license as AGPL-3.0; foliate-js is MIT and PDF.js is Apache-2.0. MuPDF is offered under [AGPL or commercial terms](https://mupdf.readthedocs.io/en/latest/license.html); PDFium has its own [license and third-party notices](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE). The proposed approach is to reuse suitable libraries and independently implement the small interface. A direct application fork would need a separate distribution decision under its actual license.

What “lightweight” should mean

There are no trustworthy apples-to-apples memory measurements from this research. Do not promise a 10 MB app or a 50 MB memory footprint. Installer size, installed dependencies, running memory, idle CPU, startup time, and document latency are different measurements.

The largest avoidable mistake is keeping every PDF page rendered at full resolution. Mozilla's [PDF.js FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions) explicitly recommends rendering visible pages because each bitmap consumes substantial memory. Recommended design: render visible pages, prefetch a bounded neighbor set, enforce a memory budget, evict old surfaces, cancel stale renders after rapid navigation, and avoid a continuous repaint loop while idle. Lazy-load engines when their format is opened.

Proposed validation targets, not achieved results:

| Measurement | Initial target or method |
| --- | --- |
| Ordinary local file opening | Usable first content within 1 second on the target machine; record cold and warm separately. |
| Cached page changes | Under 100 ms at the 95th percentile in a repeated navigation test. |
| Idle CPU | Near zero once rendering and position saves settle; investigate sustained use over 0.5% on the same machine. |
| Memory | Record private memory for the full process tree plus GPU allocation separately; compare the same files at the same scale. Choose a budget from observed baselines. |
| Long-session behavior | No steady growth after repeated forward/backward navigation and document switches. |
| Package footprint | Record app payload, installer and any missing WebView2 prerequisite separately. |
| Position recovery | Return to the same paragraph/page region after closing, resizing, font changes and monitor changes. |

The test set should include a long text PDF, a large scanned PDF, an image-heavy magazine, a two-column paper, a password-protected PDF, an EPUB with footnotes and images, a fixed-layout EPUB, Unicode/RTL content, Markdown tables/code, and a large plain-text file. Test both compact and normal windows at multiple display scales. Separate source-file loading from rendering so a cloud-storage online-only download is not mistaken for an engine slowdown.

The recommended next step is a short evaluation of Readest and SumatraPDF using representative files. Record which requirements pass, which need customization, and measured resource use. If Readest already meets the workflow, use it. If the compact window and size lock remain meaningful gaps, compare a minimal Tauri prototype against a native PDF prototype before committing to the full implementation. The prototype should prove real rendering, resume behavior, pinning and size locking; a polished empty window would not answer the architecture question.

For a custom first release, retain the four formats, opening/recent files, position restore, pinning, resizing/size lock, configurable local shortcuts, optional global page shortcuts, fit modes, a progress footer, basic search/copy, bookmarks, and locally stored session information. Defer complex annotations, OCR, cloud synchronization, DRM support, AI features, and a large library manager until the reading experience and resource targets are proven.

The remaining product choice is how much weight to give minimum memory use versus fidelity across illustrated and richly formatted books. The research supports Tauri as the practical default for the requested breadth, with measured performance deciding whether the native alternative is worth the additional work.
