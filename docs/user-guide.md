# Float Reader user guide

Everything Float Reader does, in detail. For a quick tour, see the [README](../README.md).

## Opening documents

Open a PDF, DRM-free EPUB, Markdown, TXT or image file (PNG, JPEG, WebP, GIF, AVIF, BMP) with
**Open**, Ctrl+O, a single-file drop or a command-line file argument. The Windows installer adds
Float Reader to Explorer's **Open with** list for the document formats without changing the default
app; clean-account installer behavior has not yet been verified. A second instance routes its file
request to the running app.

## The window

**Pin** keeps the reader above ordinary windows. **Lock** captures its outer dimensions while
allowing movement. Ctrl+Shift+T toggles pin; Ctrl+Shift+L toggles lock. The menu includes both
controls, window presets (Compact 420 × 620, Reading 760 × 900), typography, fit/zoom, rotation,
contents, Go to, Back and a shortcut reference.

## Appearance

Open the menu and choose **Appearance…** to open the Appearance panel at the bottom of the window.

- **Mode:** System (default; follows the operating system as it changes), Light or Dark.
- **Theme:** Lilac (default), Birch, Graphite or Arctic. Each has a light and a dark version.
  Hover over or focus a theme to preview it on the whole window, click or press Enter to keep it, and
  move away or press Escape to go back to the theme you kept.
- **Accent:** the theme's own accent, one of six presets, or a custom color. Contrast is adjusted
  automatically so text and controls stay readable.
- **Page:** Match theme, White, Sepia or Dim for text documents (Markdown, TXT and reflowable EPUB).
  PDF pages, fixed-layout EPUB pages and images always keep their original colors.

Choices are saved on this computer and applied before the window first paints, so there is no flash
of the wrong theme. The native title bar follows the light or dark mode.

The theme design is inspired by [Tern](https://stencil.so/tern) by Stencil, and the Graphite theme
uses Tern's default palette. See [Credits](../README.md#credits).

## Moving through a document

PgDn/PgUp change pages. Space/Shift+Space traverse one screen, scrolling a tall PDF page before
advancing. Ctrl+G jumps to a physical page, EPUB chapter/percentage or source line. The footer
reports **position**, never completion or material actually read.

The footer slider scrubs the entire document. Click the track to jump, or drag the thumb to preview
a destination and release to navigate. PDF and fixed-layout EPUB snap to physical pages (to whole
spreads in two-page view);
Markdown/TXT use source lines; reflowable EPUB uses whole-book percentage. With the slider focused,
arrows adjust one page/line (0.1% for reflowable EPUB), and Home/End select the first/last location.
The slider is disabled until a document opens and for single-page/single-line documents. Scrubbing
saves the resulting reading position without modifying the source file.

### Zoom and the hand tool

PDFs, images and fixed-layout EPUBs show a small floating view-controls pill at the bottom of the
reading panel (bottom-right once the panel is 720 pixels wide or more). It holds zoom out, the zoom
level (**Fit**, **Width** or a percentage; click it to switch between fit page and fit width), zoom
in, the **Hand** tool and, for PDF and fixed-layout EPUB, **Single page** / **Two pages** buttons, and
stays in step with Ctrl+−/+ and Ctrl+0/2/3. When a zoomed page is larger
than the panel, press **H** (or the Hand button) and drag to pan it 1:1; text selection pauses while
the hand is on, and a click without movement still follows links. Middle-button drag pans in any
mode. The Hand button reads "Zoom in to pan" while the page fits, and the hand turns off when a new
document opens or the page fits again. Markdown, TXT and reflowable EPUB reflow instead of zooming,
so they have no pill and no panning.

### Two-page spread

**Two-page spread** (Reader controls menu, the pill's book button, or Ctrl+3) shows PDF and
fixed-layout EPUB pages side by side, edge to edge, like an open book. By default page 1 is a cover
shown alone on the right and pairs follow as 2–3, 4–5…; turn off **Cover page alone** in the menu for
documents that should pair 1–2. Fixed-layout EPUBs keep their publisher's page sides and
right-to-left page progression. Pages of different sizes are scaled to a common height; fit page fits
the whole spread and fit width its width. Page turns, Go to, Back and the scrubber move by spread, and
the footer reads "Pages 2–3 of 27". Reflowable EPUB shows two text columns instead.

The choice is remembered per document (new documents open in single-page view), and the saved place
is the first visible page, so switching views keeps it. When the reading panel is narrower than 600
pixels (or, for reflowable EPUB, taller than wide), pages show one at a time; the Two pages button and
the subtitle explain that two-page view is waiting for more width, and it returns as soon as the
panel is wide enough.

### Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Next / previous page | PgDn / PgUp (Right / Left in page mode) |
| Next / previous screen | Space / Shift+Space |
| First / last location | Home / End |
| Go to page, chapter or line | Ctrl+G |
| Back after a jump | Alt+Left |
| Open a file | Ctrl+O |
| Document library | Ctrl+B |
| Resize library (divider focused) | Left / Right (Shift: larger steps), Home / End, Enter resets |
| Pin / size lock | Ctrl+Shift+T / Ctrl+Shift+L |
| Fit page / fit width | Ctrl+0 / Ctrl+2 |
| Two-page spread | Ctrl+3 |
| Zoom or text size | Ctrl++ / Ctrl+− |
| Hand tool (pan a zoomed page) | H, or drag with the middle button |
| Close a dialog | Escape |

## Saved reading data

Saved reading data lives in the native per-user local application-data directory under
`io.github.rvynp.floatreader` (on macOS, `~/Library/Application Support/io.github.rvynp.floatreader`),
not beside the source documents. Identical file bytes share resume state even after a rename.
Changed revisions keep the previous revision's state and show a best-effort restoration message. The
menu separately clears recents and saved reading data; neither deletes documents.

## Document library

Use the sidebar button at the left of the toolbar, or **Ctrl+B**, to open the library. At widths of
720 pixels and above it sits beside the reading panel; in compact windows it overlays the panel and
closes after you open a document. Escape dismisses it. Wide and compact visibility preferences are
remembered separately.

In the side-by-side layout, drag the divider between the library and the reading panel to resize the
library (240–520 pixels, never more than 55% of the window, and always leaving the reading panel at
least 320 pixels). Double-click the divider to reset it to 270 pixels. The divider is also
focusable: Left and Right resize by 16 pixels (Shift: 64), Home and End jump to the narrowest and
widest sizes, and Enter resets. The page refits once when you release the divider. The header button
beside **×** moves the library to the other side of the reading panel; the compact overlay follows
the same side. Width and side are remembered, and the width is re-fitted when the window shrinks.

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

## Privacy and safety

Float Reader never changes your documents, has no account, sends no analytics and needs no internet
connection. Document scripts and automatic external-resource requests are blocked; EPUB content runs
in a sandbox without script permission; Markdown raw HTML is disabled; local images load only from
inside the opened document's folder. A web link opens in your browser only when you click it.
