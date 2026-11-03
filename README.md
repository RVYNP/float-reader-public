# Float Reader

A compact, pinnable desktop reader for PDF, EPUB, Markdown, text and images, built from
[the product requirements](docs/floating-reader-prd.md). Rust/Tauri owns local file access, window
controls, identity and saved state. The small web interface uses PDF.js, foliate-js and
markdown-it. This is an implementation candidate, **not a release that has passed all P0
requirements**.

Runs on **Windows and macOS**. Source, lockfiles, tests, [research](docs/floating-reader-research-2026-10-22.md)
and requirements are self-contained in this repository. Generated executables, dependencies,
document files and personal reading/library data are not committed.

## Requirements

- Node.js 20.19+ or 22.12+ and npm (required by Vite)
- Rust 1.90+ with a native toolchain — Visual Studio Build Tools on Windows, Xcode Command Line
  Tools on macOS
- Windows only: WebView2 (preinstalled on Windows 11)

## Run

```bash
npm ci                 # installs dependencies and applies the foliate sandbox patch
npm run desktop        # native app with hot reload
npm run dev            # browser preview at http://127.0.0.1:1420
```

`npm run dev` runs the browser preview. It supports local file selection, browser-local resume, and
a library backed by IndexedDB copies of selected files. Pinning, size lock, native recent files, and
authorized relative images require the desktop app.

## Build a distributable

**macOS**

```bash
npm run package:macos            # -> dist/Float Reader.app (and a .dmg when available)
```

Produces an arm64 `.app` with a generated icon and an ad-hoc signature. It is not notarized, so
first launch requires right-click → **Open** (or `xattr -dr com.apple.quarantine`).

**Windows**

```powershell
./src-tauri/build-native.ps1     # -> dist/Float Reader.exe + WebView2Loader.dll
npm run package                  # NSIS installer (targets pinned by tauri.windows.conf.json)
```

Keep `WebView2Loader.dll` beside the `.exe`. The executable embeds the reader interface and needs
no development server.

Each platform narrows its own bundle targets, so neither inherits the other's installers:
`tauri.windows.conf.json` pins `["nsis"]` (unchanged from before the macOS work) and
`tauri.macos.conf.json` pins `["app", "dmg"]`. The base `tauri.conf.json` stays neutral with
`"all"`.

`npm ci` and every production build run the checked-in foliate sandbox patch and copy PDF
fonts/CMaps/WASM locally. Do not skip this step. No runtime CDN is used.

On the GNU Windows toolchain, `windres` can fail when its build output path contains spaces. Set a
task-specific target directory first:

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'float-reader-target'
```

## Test

```bash
npm test                                          # 58 frontend unit tests
npm run test:e2e                                  # 6 Playwright browser scenarios
cargo test --manifest-path src-tauri/Cargo.toml   # 23 native tests
npm run test:layout                               # text anchor layout check
npm run test:native                               # smoke test of the built app
npm run perf                                      # performance report
```

Browser tests pick a browser automatically: `CHROME_PATH`, then a branded Chrome/Edge/Chromium, then
a cached Playwright Chromium. Nothing is downloaded at test time. Tests construct their own small
documents; they do not use production files.

`test:native` differs by platform. On Windows it drives the real WebView2 over CDP and asserts the
full IPC surface. On macOS, WKWebView exposes no CDP endpoint, so it verifies launch, liveness and
clean quit, and skips the transport assertions with an explicit reason. Quit any running instance
first: `tauri-plugin-single-instance` makes a second launch hand off and exit immediately, which
cannot be distinguished from a failure.

> **Windows build status.** The Windows path is preserved intentionally and has not been
> regressed: `build-native.ps1` is byte-identical to before the macOS work, the Windows window-frame
> code is verbatim, `capabilities/` and the catalog/state/indexing modules are untouched, and NSIS
> targeting is pinned back to exactly `["nsis"]`. The macOS work added only `cfg`-gated branches.
> However, the Windows binary was not rebuilt or re-tested during the macOS port because no Windows
> machine or cross-compilation toolchain was available — treat a Windows rebuild as the first step
> before the next Windows release.

## Reading

Open a PDF, DRM-free EPUB, Markdown, TXT or image file (PNG, JPEG, WebP, GIF, AVIF, BMP) with
**Open**, Ctrl+O, a single-file drop or a command-line file argument. The Windows installer offers
file associations for the document formats; clean-account installer behavior has not yet been
verified. A second instance routes its file request to the running app.

Pin keeps the reader above ordinary windows. Lock captures its outer dimensions while allowing
movement. Ctrl+Shift+T toggles pin; Ctrl+Shift+L toggles lock. The menu includes both controls,
window presets, typography, fit/zoom, rotation, contents, Go to, Back and a shortcut reference.

The interface uses a light, compact style: gray-lilac window chrome, an inset reading panel, and a
blue-purple accent (`#6358d8`) for active controls, focus, links and the scrubber. The native window
uses the light theme. PDF page colors and EPUB publication styling are not recolored.

PgDn/PgUp change pages. Space/Shift+Space traverse one screen, scrolling a tall PDF page before
advancing. Ctrl+G jumps to a physical page, EPUB chapter/percentage or source line. The footer
reports **position**, never completion or material actually read.

The footer slider scrubs the entire document. Click the track to jump, or drag the thumb to preview
a destination and release to navigate. PDF and fixed-layout EPUB snap to physical pages;
Markdown/TXT use source lines; reflowable EPUB uses whole-book percentage. With the slider focused,
arrows adjust one page/line (0.1% for reflowable EPUB), and Home/End select the first/last location.
The slider is disabled until a document opens and for single-page/single-line documents. Scrubbing
saves the resulting reading position without modifying the source file.

Saved reading data lives in the native per-user local application-data directory under
`io.github.rvynp.floatreader` (on macOS, `~/Library/Application Support/io.github.rvynp.floatreader`),
not beside the source documents or in this repository. Identical file bytes share resume state even
after a rename. Changed revisions keep the previous revision's state and show a best-effort
restoration message. The menu separately clears recents and saved reading data; neither deletes
documents.

## Document library

Use the sidebar button at the left of the toolbar, or **Ctrl+B**, to open the library. At widths of
720 pixels and above it sits beside the reading panel; in compact windows it overlays the panel and
closes after you open a document. Escape dismisses it. Wide and compact visibility preferences are
remembered separately.

- **Add files** selects several documents or images at once without opening them. Select a
  collection first to add new entries directly to it.
- **Index a folder of PDFs** (desktop only) picks a folder and adds every PDF beneath it. The folder
  becomes a collection, and each first-level subfolder that contains PDFs becomes a child
  collection. Entries point at the original files; nothing is copied. Indexing the same folder
  again refreshes it without duplicating entries or losing favorites and reading positions.
- **New collection** creates a named group. Use **Edit** beside a collection to rename it, or its
  **×** control to delete it after confirmation. Deleting a collection puts its documents in
  **Unfiled**; it does not delete them.
- Each document's **···** control opens **Organize document**, where you can move it to a
  collection or remove its library entry after confirmation.
- Star a document for **Favorites**. Search filters the selected view by filename or path; sorting
  offers recent-first or name order.
- Click a document to reopen it at its saved reading position. A missing or unreadable source
  reports an error without replacing the document you are reading.

The desktop library stores references to original paths, not copies. Organizing, favoriting, and
removing entries never move, rename, or delete source files or saved positions. Opening a document
adds it to the library automatically. The existing recent-file list is migrated on first load; the
library is not subject to the 20-file recent limit. Clearing recents or reading data does not clear
the library. If you move a source externally, use **Open** or **Add files** to select its new path
and remove the stale entry.

Library metadata lives alongside reading state in the per-user application-data directory. Browser
preview storage is separate: IndexedDB caches selected file contents so entries can reopen after a
reload; removing a browser library entry removes only that cached copy, not the original file.

## Current boundaries

See [implementation and validation status](docs/floating-reader-implementation.md) for tested
behavior and remaining release gates, and the
[macOS and performance audit](docs/floating-reader-macos-and-performance-audit.md) for what the port
changed and what it did not fix.

In particular, this is not yet a measured lightweight release. Whole-file binary IPC, text DOM size,
the full EPUB fidelity corpus, Narrator, monitor changes, Windows snapping, clean-account
installation and several performance budgets still need work or evidence. A known defect: resizing
the window while reading Markdown/TXT can lose the reading anchor. It is documented with a
reproduction rather than worked around.

Source files remain unchanged. Document scripts and automatic external-resource requests are
blocked. EPUB frames are sandboxed without script permission. Markdown raw HTML is disabled; local
images resolve only inside the selected document's directory tree. External HTTP(S) links require a
click. Unsupported image paths receive placeholders.

Generated assets, fixtures, browser results, executable files, generated icons and Cargo output are
ignored. Dependency versions are pinned in `package-lock.json` and `src-tauri/Cargo.lock`.

## License

[MIT](LICENSE). Third-party components keep their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md).
