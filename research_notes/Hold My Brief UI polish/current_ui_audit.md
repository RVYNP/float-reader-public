# Hold My Brief: current UI audit

Scope: a read-only inventory of the web/Tauri UI as it stands in `/home/user/hold-my-brief` on 2026-11-05. No source files were changed. Citations are `file:line` in the repo. Where a line holds a long template string (main.ts:17-41 are each one long line of HTML), the line number points to the whole template line. Screenshots taken for this audit are in `research_notes/Hold My Brief UI polish/screens/` (see the last section).

## 1. Control inventory per surface

### Takeaway
At the default 420x620 window with a PDF open, there are **15 interactive controls on screen**: 5 in the toolbar, 4 in the footer and 6 in the floating zoom pill. With a reflowable EPUB, Markdown or TXT file there are 9, because the pill is hidden. Behind the "···" button is a **23-item menu**, and there are **26 palette commands**, a **22-control appearance sheet** and a **library drawer with about 17 controls** (plus 4 more for every document). The drawer opens by default when the window is 720 px or wider. Most actions can be reached from two to four places.

### Cited findings

**Toolbar (always visible): 5 controls plus a two-line title.** `src/main.ts:17`
- Library toggle (icon), `Open` (text button with a border), a title block (`#filename` plus `#filekind`, whose subtitle reads "A reader that holds." when no document is open), `Pin`, `Lock` and the `···` menu toggle — main.ts:17.
- When a document is open, the subtitle becomes `FORMAT · <view kind>[ · Two pages][ · Hand]`, for example "PDF · Page view" or "EPUB · Reading view" — main.ts:100-102.
- When toggled, Pin and Lock change their text to "Pinned" and "Locked" — main.ts:61.

**Footer (always visible): 4 controls.** `src/main.ts:23`
- `←`, a position button (shows "Ready when you are" while empty; opens Go to), `→`, and a range scrubber that runs the full window width.
- The position label always ends in the word "position", for example "Page 48 of 146 · 44 · 32% position" or "Chapter I · ≈0% position" — main.ts:65. While dragging the scrubber it shows "… · release to jump" — main.ts:88.
- The footer has 28 px of bottom padding to hold the absolutely positioned scrubber — style.css:215, 218.

**Floating view-controls pill (PDF, images, fixed-layout EPUB only): up to 6 controls.** `src/main.ts:21`
- Zoom out, zoom level/fit toggle ("Fit", "Width" or "120%"), zoom in, a separator, the hand tool, and then an optional group of a separator, single page and two-page spread — main.ts:21. Visibility is controlled at main.ts:116-117.
- It fades to 0.7 opacity when idle — style.css:255-258. It sits bottom-centre below 720 px and bottom-right above that — style.css:255, 259.

**Notice and loading strips (transient):** `#notice` holds a message, `Retry save` and `×`. `#loading` holds a message and `Cancel` — main.ts:18-19.

**Empty state (no document): 1 primary CTA plus recents, and 6 decorative or explanatory elements.** `src/main.ts:20`
- An icon tile (`.book-mark`), the eyebrow "KEEP YOUR PLACE", the H1 "Hand it over." (34 px, or 42 px at ≥650 px wide), the tagline "Drop a brief and it stays pinned / exactly where you leave it.", the button "Hold a brief ↗", the line "PDF · EPUB · MARKDOWN · TEXT", recents (each row has an open button and a `×`) and a browser-only line, "Browser preview · Pin and size lock are available in the desktop app." — main.ts:20, 329, 332; style.css:200-214, 350-353.

**Reader menu dialog ("Reader controls"): 23 action buttons plus close.** `src/main.ts:24-33`
- Go to…, Contents, Back after jump | Toggle pin, Toggle size lock | Compact window, Reading window | Fit page, Fit width, Rotate page 90° | Two-page spread, Cover page alone | Smaller text / zoom, Larger text / zoom, Appearance… (with an icon and a value such as "Brief · System"), Typography & wrapping | First location, Last location, Previous screen, Next screen | Keyboard shortcuts, Clear recent files, Delete saved reading data… (main.ts:25-32). 13 of them carry a `<kbd>` chip.
- Only 3 visual separators are drawn, and they are hard-coded by position: `.menu-grid button:nth-child(3), :nth-child(7), :nth-child(16)` — style.css:286. As a result 9 items (from Fit page to Typography) form one undivided run. The groups in the source (one per source line) do not match the separators.
- The menu does **not** list Open, Find (Ctrl+F), Toggle library (Ctrl+B) or Command palette (Ctrl+K). Compare main.ts:25-32 with commands.ts:42-44, 87.
- In a screenshot, the disabled "Cover page alone" item still shows the pressed accent tint, because `aria-pressed="true"` is set in the markup (main.ts:29) and the pressed style (style.css:179) is not cancelled by `:disabled`. See screens/02-compact-menu-empty.png and 05-compact-menu-doc.png.
- At 420x620 the menu is taller than the window and scrolls (screens/05-compact-menu-doc.png).

**Other static dialogs (7):** Go to (main.ts:34), Password (35), Contents (36), Reading settings (37, with 4 fields: text size number, line spacing select, margins select, wrap checkbox), Appearance (38), Keyboard shortcuts (39, a hand-written `<dl>` of 19 rows), and Delete saved reading data (40).
- The shortcuts dialog is static HTML. It is *not* generated from `COMMANDS`, even though commands.ts:11-12 says "the palette and the shortcut reference dialog can both be generated from it."

**Command palette (Ctrl+K):** `src/palette.ts`, `src/commands.ts`
- It has a search icon, an input ("Type a command…"), an `Esc` kbd chip, a grouped listbox and an empty message — palette.ts:37-44.
- There are 26 commands in 6 groups (File, Navigate, View, Window, Reading, Data) — commands.ts:15, 41-68. There are 14 shortcut bindings — commands.ts:86-101.
- A command that cannot run stays listed but disabled, and each row repeats its reason text (for example "Open a document first") — palette.ts:98-110. With no document open in the browser build, 16 commands need a document and 4 need the desktop app, so **20 of 26 rows show a disabled-reason hint** (commands.ts:44-64; screens/03-compact-palette-empty.png).
- "Appearance" is in the View group but "Typography" is alone in a "Reading" group. "Keyboard shortcuts" is in "Window" — commands.ts:59-65.

**Find bar (Ctrl+F): 1 input plus 5 buttons, an icon and a status.** `src/find-bar.ts:48-55`
- Search icon, `Find in document…` input, status ("3 of 12", "No matches"), `Aa` match case, `ab` whole word, `↑`, `↓` and `×`. It is 39 px tall, pinned to the top of the reading panel, and has the popover shadow — style.css:198, 379.
- The arrows are Unicode glyphs (↑ ↓ ×), not the SVG icons the toolbar uses.

**Appearance sheet: 22 controls plus 2 explanatory lines and 3 labels.** `src/appearance.ts:45-60`
- Close; a hint ("Hover a theme to try it on the whole window. Click to keep it.", appearance.ts:14); a segmented Mode control (System, Light, Dark); THEME with 5 cards (Brief, Lilac, Birch, Graphite, Arctic), each showing "Aa" and 4 colour dots; ACCENT with 9 swatches (theme accent, 7 presets Acid/Iris/Blue/Teal/Rose/Moss/Amber, and a custom swatch with a colour picker); PAGE, a segmented control (Match theme, White, Sepia, Dim); and a footnote, "PDF pages and images keep their original colors." — appearance.ts:5-14, 45-60.
- That is 3 × 5 × 9 × 4 = 540 preset combinations, plus any custom colour.
- On desktop it is a bottom sheet 460 px wide; in a compact window it is full width — style.css:298-341.

**Library drawer: about 17 controls with one document, plus 4 for each further document.** `src/library.ts:83-114, 381-469`
- Header: "Library", a dock-side toggle and close — library.ts:86-88.
- Tools row: `Add files` (accent-tinted) and `Sources` — library.ts:90-91.
- A visible label "Search library" and an input with the placeholder "Title, tags, notes, folder…" — library.ts:92-93.
- 2 facet selects: All formats / Images / Documents, and Any availability / Ready / Missing — library.ts:95-99.
- Filters: All references, Favorites and Unfiled, each with a count — library.ts:388.
- A "COLLECTIONS" heading with `+ New`, a collection tree (expand, select, and `···` edit), the empty hint "Create a collection or index a folder.", and an optional "SOURCES" section — library.ts:389-405.
- A result count ("1 reference") and a sort select (Recent first / Name A–Z) — library.ts:101-103.
- Each document row has an open button (name plus mono meta "PDF · ready · Reading"), `★/☆`, `Info` and `···` (organize) — library.ts:457-468.
- A pager (← n–m / total →) appears above 40 items — library.ts:470-474.
- A resize handle with a 3-dot grip and a tooltip that says "Drag to resize · double-click to reset" plus a px readout — library.ts:108-112.
- An image-collection navigator floats in the workspace (← n / N · name →) — library.ts:114, 337-352.
- The library dialogs are Organize (collections checkbox tree, Favorite, Personal tags, Personal notes, help paragraph, a `<details>` "Source and original location" with Locate buttons, Save, "Remove from library…" with a two-step confirm, and Close; library.ts:289-317), Reference details (Open in reader, Organize…, Locate, Close; 318-326), Sources and originals ("Index a folder of PDFs", Locate folder…, Close; 353-368) and New/Edit collection (name, parent, Save, "Delete collection…" with a two-step confirm; 243-272).
- **It opens by default at ≥720 px**: `preference()` returns `wide.matches` when nothing is saved — library.ts:72. It floats over the page and covers it (screens/14, 15, 17). In dark mode the drawer has no shadow, because `--shadow-drawer` is transparent in dark (style.css:150-153), so only a hairline separates it from the page text (screens/17-wide-epub-dark.png).

### Inferences
- Two-page spread can be reached from 4 places (pill, menu, palette, Ctrl+3), and so can zoom (pill, menu, palette, keyboard). Pin and Lock can be reached from 3 places plus their shortcuts. Fit page and fit width can be reached from 3. Polished apps such as Zed, Linear and Raycast usually keep one visible affordance and put the rest in the palette.
- The menu and the palette overlap almost entirely: the 23 menu items are a subset of the 26 palette commands. The menu is effectively a second, unsearchable palette.
- The library is the largest surface in the app (495 lines, its own CSS file, 4 dialogs).

### Gaps
- Native Tauri window chrome and OS menus were not inspected; only the web UI was. No native menu definitions were checked in `src-tauri`.

## 2. Design-token audit (src/style.css, src/library.css)

### Takeaway
Colour is fully tokenised: 20 tokens per theme, in 5 palettes, through `light-dark()`. Nothing else is. There are **no tokens for type scale, font weight, spacing, radius, z-index or motion**, and those values are hand-picked in each rule. Across the two files there are **14 font sizes, 4 explicit weights, 13 radii, about 51 distinct padding declarations and 8 letter-spacings**.

### Cited findings

**Colours**
- style.css has **197 unique hex values**; library.css has 0. All 197 are inside custom-property definitions: 5 palettes × 20 tokens × light/dark (style.css:9-120), the page-tone overrides (122-125) and the shared status and shadow tokens (137-154).
- The only hex outside a theme block is in the `[data-page]` tone rules (style.css:122-123), which are still custom properties.
- Per-theme tokens (20): `--chrome --surface --card --paper --ink --fg --muted --faint --border --hairline --hover --stage --track --accent --accent-ink --accent-soft --accent-border --accent-fill --scrim --search-hit` (style.css:12-31). There are 10 derived or shared tokens in addition: `--raise --hover-subtle --code --rule --accent-fill-hover --accent-soft-hover --on-accent --error --danger --danger-hover --notice --notice-ink --notice-border` (137-149).
- Some tokens are redundant in the brand theme: `--ink` = `--fg` (#1a1815/#f4f1ea) and `--paper` = `--surface` (style.css:13-16). `--accent` = `--accent-fill` in light (25, 29). `--error` and `--danger` share a light value (#a13449; 144-145).
- Colour logic is written inline instead of as tokens: `.library-resize-tip` uses `light-dark(var(--fg), var(--border))`, `light-dark(var(--fg), var(--card))` and `light-dark(var(--chrome), var(--fg))`, and `.library-resize-value` does the same (library.css:32, 34).
- Accent preset hex values are hard-coded in TypeScript (`#e13a3a #a86af4 #3d6fff #2b8a84 #c2456b #5f8a3a #c27a1a`, appearance.ts:12). The "Acid" preset `#e13a3a` is identical to the Brief theme accent (style.css:25), so in the default theme the first two swatches look the same (docs/media/appearance.png).
- A font family is hard-coded: `.theme-sample { font: 16px/1.2 Georgia, 'Times New Roman', serif }` (style.css:319), outside the `--font-ui` and `--font-mono` tokens (130-131).

**Font sizes: 14 distinct values (no scale tokens)**
- style.css: 12px ×13, 13px ×4, 11px ×4 (plus one `11px !important` at 209), 10px ×3, 14px (root, 134), 15px (h2, 272), 18px (`#menu-toggle`, 192), 22px (dialog close ×, 275), 28px (short-window h1, 347), 34px (h1, 203), 42px (h1 ≥650 px, 352). Font shorthand sizes: 10px/1.4 mono ×4 (188, 289, 290, 306), 10px/1.5 mono `!important` (202), 10px/1 mono (263), 9px/1.5 mono (208), 9px/1.4 mono (339), 11px/1.5 mono (216), 16px Georgia (319).
- library.css: 10px ×5, 12px ×4, 11px ×2, 14px (7), 16px (59), `10px !important` (64), `17px !important` (74), and shorthand 10px/1.4 mono (32) and 9px/1.4 mono (72).
- Union: **9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 28, 34, 42 px**. Body UI text sits between 9 and 13 px, which is very small. Five distinct sizes are used for monospace "metadata": 9, 10, 11 and so on.

**Font weights: 4 explicit values.** 600 (style.css:187, 205, 211, 272, 326; library.css:43, 54, 76, 78, 87), 550 (h1, style.css:203), 650 (library header, library.css:7), 500 (library.css:71).

**Letter-spacing: 8 distinct values.** 1.5px (202), -.9px (203), .7px (208), .6px (306), .2px (339), .06em (365), .4px (library.css:54), .3px (library.css:72).

**Line-height: 6 distinct values** (1, 1.15, 1.4, 1.5, 1.6, 1.65), plus the ones in shorthands.

**Border radius: 13 distinct values.** style.css: 5px ×5, 50% ×4, 6px ×3, 8px ×3, 9px ×2 (workspace, pill), 10px ×2 (book-mark, dialog), 2px, 0, 3px (kbd), 14px 14px 0 0 (sheet), 11px (theme card), 4px. library.css: 6px ×3, 4px ×2, 9px, 1px, 50%, 5px, 0. Union: **0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 14 px, 50%**.

**Shadows: 4 tokens plus 2 inline rings.** `--shadow-popover: 0 12px 48px`, `--shadow-sheet: 0 -6px 28px`, `--shadow-drawer: 8px 0 30px`, `--shadow-page: 0 2px 12px` (style.css:151-154; all transparent in dark). The inline rings are `0 0 0 1px var(--accent)` (scrubber thumb, 220) and `0 0 0 .5px var(--accent)` (theme card, 317). The popover shadow is used on the dialogs, the loading strip **and** the find bar (230, 270, 379), and on the right-docked drawer (library.css:16).

**Transitions: 3 durations, 1 delay.** `opacity .15s` (view pill, style.css:258), `opacity .12s` (resize handle, library.css:35), `transition-delay .35s` and `0s` (library.css:37-38), and the reduced-motion override `0s !important` (style.css:171). There are no transitions on dialogs, the drawer, hover states or the sheet: they appear instantly.

**Spacing: no scale.** style.css has 31 distinct `padding` values, 21 distinct `margin` values and 11 distinct `gap` values (2, 3, 4, 6, 7, 8, 10, 12, 12/8, 13, 24). library.css has 20 padding, 18 margin and 5 gap values (2, 3, 5, 6, 8).
- Examples: `7px 9px`, `6px 7px`, `5px 6px`, `11px 15px`, `9px 10px`, `8px 8px 3px`, `16px 13px 18px`, `14px 18px 16px`, `5px 10px 28px`, `0 3px 2px` (style.css); `7px 3px`, `4px 3px`, `5px 4px`, `4px 18px 4px 4px` (library.css).
- Every integer px value from 1 to 16 is used somewhere in style.css. There are 54 distinct px numbers in style.css and 36 in library.css.
- Collection indent in TypeScript is 12 px per level in the Organize dialog (library.ts:295) but 11 px in the sidebar (library.ts:395).

**z-index:** 2, 5, 6, 20, 25 (style.css:230, 255, 379; library.css:3, 27, 97). There is no layer token.

**`!important`: 9 uses.** style.css:171, 202 (×2), 209, 243, 269, 346; library.css:40, 64, 74. Several of these patch the cascade (`.eyebrow` overrides `#empty > p`, `.library-favorite` font-size).

**Magic numbers kept in sync by hand:** `--find-bar-height: 39px` (style.css:198), and the 720/734 px breakpoint dance explained in a long comment (library.css:17-26). `270px` is repeated as a fallback 4 times (library.css:3, 25; style.css:238-239). Breakpoints are 480 (height), 650, 719/720.

### Inferences
- A polish pass would gain most from adding about 6 type steps, a 4 px spacing scale, 3 radii (for example 4/6/10) and a motion token, and then mapping the 14 sizes and 13 radii onto them.
- The colour system is the strongest part of the CSS. Its weakness is breadth (5 palettes × 9 accents × 4 page tones), not inconsistency.

### Gaps
- Computed or rendered values were not measured (for example the effective font sizes inside the EPUB and PDF renderers or foliate). Only authored CSS was counted. Adapter-injected styles in `src/adapters/*` were not audited.

## 3. Visual review of docs/media/*.png and fresh screenshots

### Takeaway
The reading surface itself is calm. The clutter is in the chrome. Toolbar text buttons ("Open / Pin / Lock") have no icons and weak hierarchy. The footer position string is wordy, uses monospace and repeats the word "position". The library drawer is a dense stack of seven kinds of control. The appearance sheet has an orphaned card and a duplicate swatch. Accent red is used for many unrelated states (active library row, pressed toggles, focus rings, the scrubber, the CTA, the toggle button).

### Cited findings
- **Toolbar hierarchy** (hero.png, library.png, hand-tool.png):
  - `Open` is a bordered, filled button, while `Pin`, `Lock` and `···` are bare text. Three text words compete with the filename.
  - The subtitle in mono ("PDF · Two-page view", "PDF · 120% · Hand") repeats state that the pill already shows.
  - The library toggle uses an SVG icon, but every other toolbar control is text — main.ts:17.
- **Footer**:
  - "Pages 48-49 of 146 · 44-45 · 32% position" (hero.png) packs three location systems (physical page, page label, percent) and a trailing noun into a centred mono string.
  - The left and right arrows sit at the far edges, about 1250 px apart at reading width.
  - The scrubber is a thick 4 px red track with a 14 px red thumb ringed in white, the strongest colour element on screen in every shot (hero.png, themes.png).
- **Double framing**: the reading panel is a rounded bordered card (9 px radius, 1 px border, 6 px side margin) inside the chrome, and the PDF page has its own edge inside that. The pill is a third bordered card (style.css:199, 255). See library.png and hand-tool.png.
- **Library drawer** (library.png, screens/15):
  - From top to bottom: title and 2 icons → a tinted "Add files" pill beside a bare "Sources" → the label "Search library" → the input → 2 dropdowns → 3 filter rows with counts → a divider and "COLLECTIONS + New" → hint text → a divider, "1 reference" and "Recent first" → the document card.
  - Before the first document there are **about 11 rows of chrome**.
  - The document card is tinted red, has a red border and red mono meta ("PDF · ready · Reading"), and shows `★`, a text "Info" button and `···` side by side. That is three trailing actions in three visual languages: a glyph, a word and an ellipsis.
  - "All references" uses the same red-tinted selected style as the active document.
- **Appearance sheet** (appearance.png, screens/10):
  - 5 theme cards in a 4-column grid (style.css:313) leave "Arctic" alone on a second row.
  - The theme-accent swatch and the "Acid" preset are both #e13a3a in Brief, so the first two red dots look the same.
  - The "Match theme" segment label nearly fills its segment.
  - A mono footnote at 9 px (style.css:339) and an instruction sentence at the top add text.
  - The sheet is a third container style (bottom sheet, 14 px top radius), different from the centred dialogs (10 px radius) and the drawer (9 px).
- **Themes** (themes.png): the five palettes differ only slightly in hue, mainly in the chrome tint and the accent. At README scale they are almost indistinguishable apart from the scrubber dot colour. This supports reading 5 palettes as more breadth than users can perceive.
- **Pill** (hero.png, hand-tool.png): when spreads are available, single page and two-page each get an icon toggle, and the active one has a red tinted box. Together with a red-tinted hand tool, two red boxes can be lit at once (hand-tool.png).
- **Fresh web-build screenshots** (screens/):
  - 01: the empty state carries the eyebrow, the H1, a two-line tagline, a full-width red CTA with ↗, a formats line and the preview note, all at 420 px. The footer shows a disabled scrubber and "Ready when you are".
  - 03: in the palette with no document, most rows are greyed and each carries "Open a document first", which reads as a wall of repeated text.
  - 04, 06, 09, 15: after opening a file, a 2 px red focus ring outlines the whole reading surface (style.css:180, 247; focus set at main.ts:260). It shows up in automated shots, where the last interaction was not a pointer click. Whether it appears after a mouse click in the real app was not verified.
  - 05: the disabled "Cover page alone" menu row is highlighted pink (see section 1).
  - 13: the shortcuts dialog is a 19-row two-column list.
  - 14 and 15: at 1080x680 the library drawer is open by default and covers the left quarter of the page.
  - 17: in dark mode the drawer overlaps the EPUB text with no shadow.

### Inferences
- The main hierarchy problem is that accent red marks *selection*, *pressed state*, *focus*, *progress* and *primary action* at once. Polished apps reserve the accent for one or two roles and use neutral fills for the rest.
- Monospace metadata appears in 7 places (subtitle, footer, kbd chips, sheet labels, library meta, the appearance note and the formats line), which makes the chrome look busier than the content.

### Gaps
- `docs/media/desktop.png` (2560x1600) and `library-resize.gif` were not viewed. They are marketing composites and a GIF, not distinct UI states.

## 4. Likely fluff

### Takeaway
The clearest candidates are: the explanatory copy throughout; the duplicate access paths (menu versus palette versus pill); the window presets; the browser-preview notices; the library's facet selects, Sources and collections machinery (the PRD defers "a library manager" entirely); and the breadth of the appearance options (540 combinations).

### Cited findings
**Explanatory or decorative text in the UI**
- The subtitle "A reader that holds." (main.ts:17).
- In the empty state: the icon tile, "KEEP YOUR PLACE", "Hand it over.", the two-line tagline, "↗" in the CTA, and the "Hold a brief" label in place of "Open file" (main.ts:20).
- The footer text "Ready when you are" (main.ts:23), the word "position" appended to every location (main.ts:65), and "release to jump" (main.ts:88).
- The browser note "Browser preview · Pin and size lock are available in the desktop app." (main.ts:20, 329).
- The appearance hint "Hover a theme to try it…", its previewing variant, and the footnote "PDF pages and images keep their original colors." (appearance.ts:14, 60, 80).
- In the library: a visible "Search library" label above a field that has a placeholder (library.ts:92), the resize tooltip "Drag to resize · double-click to reset" with a live px value (library.ts:112), the empty-collections hint (403), the empty-library copy "Your references, collected." (454), the Organize help paragraph (301), "(choose more than one)" in the legend (292), the Sources help paragraph (359), and two-step delete confirmations with long reassurance paragraphs (254, 306).
- In the palette, the per-row disabled reasons (palette.ts:105-110).
- The sentence in the Delete saved reading data dialog (main.ts:40). This one is required by PRD DATA-01, "Explain what will be removed".

**Duplicated controls**
- Pin and Lock appear in the toolbar, the menu and the palette.
- Zoom ± appears in the pill, the menu and the palette.
- Fit page and width appear in the pill (the zoom-level toggle), the menu and the palette.
- Spread appears in the pill, the menu and the palette.
- Recents appear in the empty state (main.ts:332) and also in the library ("Recent first" sort, main.ts:264 refresh).
- The shortcuts list exists in a static dialog (main.ts:39) and also as kbd chips in the menu and palette.
- "Smaller/Larger text / zoom" and "Typography & wrapping → Text size" do the same thing.
- "Two-page spread" plus "Cover page alone" also appear as two icons in the pill.

**Rarely used or edge options**
- Compact window and Reading window presets (main.ts:27, 288). The PRD only asks for a Reading preset (PRD line 38).
- Rotate page 90° (PRD FMT-01 does require it).
- Previous screen and Next screen as menu items (Space and Shift+Space exist).
- First and Last location in the menu.
- Cover page alone.
- Clear recent files and Delete saved reading data placed in the main reading menu, next to navigation.
- The accent picker with 7 presets plus a custom colour.
- The library facets (format and availability), the dock-side toggle (library.ts:86, 140), the resize tip readout, and the image-collection navigator.

**Decorative elements**
- The book-mark icon tile (style.css:201) and the `Aa` and colour-dot previews on each theme card (appearance.ts:50).
- The resize-handle 3-dot grip on an accent pill (library.css:29-30).
- The `palette-esc` chip.
- The `↗` glyph on the CTA.

### Inferences
- Removing or folding the explanatory copy and the menu-only duplicates would reduce visible text strings by a large share without removing any capability, because the palette already searches all 26 commands.

### Gaps
- There is no usage telemetry (PRD DATA-01 forbids hidden telemetry), so "rarely used" is a judgement, not a measured fact.

## 5. Test and perf infrastructure for a screenshot loop

### Takeaway
Most of what an automated "screenshot → critique → change" loop needs is already present: a Playwright config sized to the 420x620 compact window, a dev web server, file injection through `#file-input`, synthetic PDF/EPUB/Markdown fixture generators, and a media reshoot script with shot and settle helpers. The main obstacle in this environment is the browser revision: Playwright 1.64.1 expects chromium-1248, but only chromium-1243 is installed.

### Cited findings
- `playwright.config.ts`:
  - testDir `./e2e`; baseURL `http://127.0.0.1:1421`; viewport **420x620**.
  - webServer `npm run dev -- --port 1421` with `reuseExistingServer`; expect timeout 15 s.
  - Browser resolution is platform-aware through `tests/browser/platform.mjs`: CHROME_PATH, then branded Chrome/Edge, then any Playwright cache revision, then the bundled browser.
- The e2e specs contain 29 tests: find.spec.ts 7, palette.spec.ts 6, reader.spec.ts 3, renderers.spec.ts 10, spread.spec.ts 3. They load documents with `page.locator('#file-input').setInputFiles({ name, mimeType, buffer })` (e2e/reader.spec.ts:7, 27; renderers.spec.ts:48). That pattern also works for screenshot setup.
- `scripts/reshoot-media.mjs` (306 lines):
  - It defines `COMPACT = 420x620` and `READING = 1080x680` and sets `deviceScaleFactor: 2` and `colorScheme: 'light'`.
  - It seeds the theme through `localStorage['hold-my-brief:appearance']`.
  - Helpers: `loadFile`, `jumpTo`, `settle`, `shot` (which screenshots `#app`) and `setLibrary`. It also composes sheets (hero, themes).
  - It expects the dev server on :1420 and needs two real documents as arguments.
  - It hard-codes a macOS Chrome-for-Testing path (`CHROME`).
- `tests/perf/run.mjs` (311 lines) runs the built `dist/` in Chromium against deterministic fixtures, with `--json`, `--only=`, `--baseline=` and `--record=` for before/after comparisons. `tests/perf/fixtures.mjs` exports `textPdf`, `plainText`, `markdown`, `zip` and `reflowableEpub` (lines 5, 41, 51, 66, 95). These fixtures can be reused to produce screenshot content without copyrighted files.
- `tests/browser/text-layout.mjs`, `native-smoke.mjs` and `raw-bytes-smoke.mjs` are further Playwright scripts.
- package.json scripts: `dev` (vite on 1420), `build`, `test` (vitest), `test:e2e`, `test:layout`, `perf` and `perf:json` (package.json:11-24).
- Unit tests in `tests/*.test.ts` cover commands, the library model and layout, search, spread, text and theme.
- In this environment, `npm ci` and `npx vite build` succeeded (the build took 949 ms; `dist/assets/index-*.js` is 92 kB and pdf is 442 kB). `chromium.launch()` with no options failed: "Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1248/…", because the repo's Playwright wants revision 1248 and `/opt/pw-browsers` holds 1243. Passing `executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'` worked.

### Inferences
- A loop could serve `dist/` with `vite preview`, inject the perf fixtures through `#file-input`, seed appearance and library state through localStorage (`hold-my-brief:appearance`, `hold-my-brief:library-wide|narrow`, `hold-my-brief:library-width`, `hold-my-brief:library-side`; library.ts:71, 119), and capture the fixed state list used below. Pixel-diffing against `docs/media` is not viable, because those shots use real documents at 2x.

### Gaps
- No existing visual-regression (`toHaveScreenshot`) baselines were found in `e2e/`.

## 6. PRD comparison (docs/floating-reader-prd.md)

### Takeaway
The PRD's intended UI is small: "a compact title bar with Open, filename, Pin, Lock size, and a menu… a single progress footer". It explicitly defers "a library manager", and it lists light/dark/sepia themes, search and spreads as P1 "NEXT" items. The current UI goes well beyond this with the library drawer, the 5-palette and 9-accent appearance system, the command palette, the find bar, the floating zoom pill and window presets.

### Cited findings
- PRD line 36: "The initial interface has a compact title bar with Open, filename, Pin, Lock size, and a menu. The reading surface takes the remaining space above a single progress footer. Secondary controls can move into the menu at narrow widths." The current toolbar matches this *plus* a library toggle and a mode subtitle (main.ts:17).
- PRD line 38: "An empty state shows Open file, supported formats, and recent files." The current empty state adds the eyebrow, H1, tagline, icon tile and preview note (main.ts:20). It also labels the action "Hold a brief" rather than "Open file".
- PRD line 38 offers "a Reading preset at 760 × 900". The current UI adds a second "Compact window" preset (main.ts:27).
- PRD line 141 defers "reference portals, tabs/multiple reader windows, **a library manager**". The current UI ships a full library manager: collections (nested), favorites, tags, notes, folder indexing ("Sources"), format and availability facets, sort, paging, thumbnails, a dock side and a resizable width (library.ts, 495 lines; library.css, 121 lines). The PRD also says "No bookshelf… is required before opening a file" (line 36), yet the drawer opens by default at ≥720 px (library.ts:72).
- PRD line 138 (NEXT-04, P1) lists "two-page spreads… and light/dark/sepia reading themes". The current UI has 3 modes × 5 palettes × 9 accents (plus custom) × 4 page tones (appearance.ts:5-13), well beyond "light/dark/sepia".
- PRD line 136 (NEXT-02, P1) lists "Search". It is implemented as the find bar with match-case and whole-word toggles (find-bar.ts:48-55).
- The command palette and the hand tool or zoom pill are not mentioned in the PRD (no matches for "palette" or "hand" in the UI sense). The PRD only asks for fit-page, fit-width, zoom and rotation, reachable "through the menu as well" (PRD lines 47, 87).
- NAV-01 (PRD line 90): "Every shortcut has an equivalent visible control or menu item." Ctrl+F (Find) and Ctrl+K (Palette) have **no** menu item or visible button (main.ts:25-32), so the current UI does not meet NAV-01 for those two shortcuts. The palette itself does list Find.
- What the PRD does require, and the UI has: pin and lock visible with state (WIN-04), Go to, Contents, Back, separate Page and Screen navigation, Clear recents and Delete reading data as separate actions with an explanation (DATA-01), password entry, and the "Progress could not be saved" plus Retry notice (REL-04; main.ts:162).

### Inferences
- Taking the PRD as the baseline, the largest cuts or demotions would be: the library (deferred), the appearance breadth (only P1 light/dark/sepia), the compact preset, and the decorative empty state. The palette and find are P1-adjacent additions that likely earn their place but could replace much of the menu.

### Gaps
- The PRD has no visual-design section (no type scale, spacing or colour spec), so polish targets have to come from the reference apps, not the PRD.

---

### Screenshot index (web build, Chromium headless 1243, deviceScaleFactor 1, `vite preview`)
Fixtures came from `tests/perf/fixtures.mjs`: a synthetic PDF, Markdown and EPUB whose text is placeholder tokens.
`01-compact-empty`, `02-compact-menu-empty`, `03-compact-palette-empty`, `04-compact-pdf`, `05-compact-menu-doc`, `05b-compact-menu-doc-scrolled`, `06-compact-pdf-find`, `07-compact-pdf-zoomed`, `08-compact-library-sheet`, `09-compact-markdown`, `10-compact-appearance`, `11-compact-palette-doc`, `12-compact-typography`, `13-compact-shortcuts`, `14-wide-empty-library-default`, `15-wide-pdf-library-open`, `16-wide-pdf-library-closed`, `17-wide-epub-dark`, `18-compact-empty-dark`. Compact is 420x620 and wide is 1080x680. The script is at `/tmp/claude-0/-home-user/c520ba8b-8921-578f-b19a-26e4b6d83551/scratchpad/shoot.mjs` (outside the repo).
