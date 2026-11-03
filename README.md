# Float Reader

A Windows-first desktop reading candidate built from [the product requirements](docs/floating-reader-prd.md). Rust/Tauri owns local file access, window controls, identity and saved state. The small web interface uses PDF.js, foliate-js and markdown-it. This is an implementation candidate, **not a release that has passed all P0 requirements**.

Source, lockfiles, tests, [research](docs/floating-reader-research-2026-10-22.md) and requirements are self-contained in this repository. Generated executables, dependencies, document files and personal reading/library data are not committed.

## Run

The compiled local candidate, when present, is `dist/Float Reader.exe`. Keep the accompanying `WebView2Loader.dll` beside it. It embeds the reader interface and does not need a development server. Windows WebView2 must be installed. This executable is an unsigned development build, not an installer.

For development, install Node.js and the Rust Windows toolchain with its native build prerequisites, then run from this folder:

```powershell
npm ci
npm run desktop
```

`npm run dev` runs the browser preview. It supports local file selection, browser-local resume, and a library backed by IndexedDB copies of selected files. Pinning, size lock, native recent files, and authorized relative images require the desktop app.

```powershell
npm test
npm run test:e2e
node tests/browser/text-layout.mjs
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
./src-tauri/build-native.ps1
npm run package
```

Browser integration tests use installed Microsoft Edge. The separate text layout check accepts `CHROME_PATH` or discovers Chrome/Edge. Tests construct their own small documents; they do not use production files. `npm ci` and every production build run the checked-in foliate sandbox patch and copy PDF fonts/CMaps/WASM locally. Do not skip this step. No runtime CDN is used.

On the GNU Windows toolchain, `windres` can fail when its build output path contains spaces. Set a task-specific target directory before Cargo/Tauri commands:

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'float-reader-target'
```

## Reading

Open a PDF, DRM-free EPUB, Markdown, TXT or image file (PNG, JPEG, WebP, GIF, AVIF, BMP) with **Open**, Ctrl+O, a single-file drop or a command-line file argument. The installer configuration offers Windows file associations for the document formats; clean-account installer behavior has not yet been verified. A second instance routes its file request to the running app.

Pin keeps the reader above ordinary windows. Lock captures its outer dimensions while allowing movement. Ctrl+Shift+T toggles pin; Ctrl+Shift+L toggles lock. The menu includes both controls, window presets, typography, fit/zoom, rotation, contents, Go to, Back and a shortcut reference.

The interface uses a light, compact style: gray-lilac window chrome, an inset reading panel, and a blue-purple accent (`#6358d8`) for active controls, focus, links and the scrubber. The native window uses the light theme. PDF page colors and EPUB publication styling are not recolored.

PgDn/PgUp change pages. Space/Shift+Space traverse one screen, scrolling a tall PDF page before advancing. Ctrl+G jumps to a physical page, EPUB chapter/percentage or source line. The footer reports **position**, never completion or material actually read.

The footer slider scrubs the entire document. Click the track to jump, or drag the thumb to preview a destination and release to navigate. PDF and fixed-layout EPUB snap to physical pages; Markdown/TXT use source lines; reflowable EPUB uses whole-book percentage. With the slider focused, arrows adjust one page/line (0.1% for reflowable EPUB), and Home/End select the first/last location. The slider is disabled until a document opens and for single-page/single-line documents. Scrubbing saves the resulting reading position without modifying the source file.

Saved reading data lives in the native per-user local application-data directory under `io.github.rvynp.floatreader`, not beside the source documents or in this repository. Identical file bytes share resume state even after a rename. Changed revisions keep the previous revision's state and show a best-effort restoration message. The menu separately clears recents and saved reading data; neither deletes documents.

## Document library

Use the sidebar button at the left of the toolbar, or **Ctrl+B**, to open the library. At widths of 720 pixels and above it sits beside the reading panel; in compact windows it overlays the panel and closes after you open a document. Escape dismisses it. Wide and compact visibility preferences are remembered separately.

- **Add files** selects several documents or images at once without opening them. Select a collection first to add new entries directly to it.
- **Index a folder of PDFs** (desktop only) picks a folder and adds every PDF beneath it. The folder becomes a collection, and each first-level subfolder that contains PDFs becomes a child collection. Entries point at the original files; nothing is copied. Indexing the same folder again refreshes it without duplicating entries or losing favorites and reading positions.
- **New collection** creates a named group. Use **Edit** beside a collection to rename it, or its **×** control to delete it after confirmation. Deleting a collection puts its documents in **Unfiled**; it does not delete them.
- Each document's **···** control opens **Organize document**, where you can move it to a collection or remove its library entry after confirmation. A document belongs to one collection at a time.
- Star a document for **Favorites**. Search filters the selected view by filename or path; sorting offers recent-first or name order.
- Click a document to reopen it at its saved reading position. A missing or unreadable source reports an error without replacing the document you are reading.

The desktop library stores references to original paths, not copies. Organizing, favoriting, and removing entries never move, rename, or delete source files or saved positions. Opening a document adds it to the library automatically. The existing recent-file list is migrated on first load; the library is not subject to the 20-file recent limit. Clearing recents or reading data does not clear the library. If you move a source externally, use **Open** or **Add files** to select its new path and remove the stale entry.

Library metadata lives alongside reading state in the per-user application-data directory. Browser preview storage is separate: IndexedDB caches selected file contents so entries can reopen after a reload; removing a browser library entry removes only that cached copy, not the original file.


## Current boundaries

See [implementation and validation status](docs/floating-reader-implementation.md) for tested behavior and remaining release gates. In particular, this is not yet a measured lightweight release. Whole-file binary IPC, text DOM size, the full EPUB fidelity corpus, Narrator, monitor changes, Windows snapping, clean-account installation and performance budgets still need work/evidence.

Source files remain unchanged. Document scripts and automatic external-resource requests are blocked. EPUB frames are sandboxed without script permission. Markdown raw HTML is disabled; local images resolve only inside the selected document's directory tree. External HTTP(S) links require a click. Unsupported image paths receive placeholders.

Generated assets, fixtures, browser results, executable files and Cargo output are ignored. Dependency versions are pinned in `package-lock.json` and `src-tauri/Cargo.lock`.

## License

[MIT](LICENSE). Third-party components keep their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md).
