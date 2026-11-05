# Desktop Analogues: UI Patterns for a Compact, Restrained Reader (Hold My Brief)

Research note on method and limits: this session's network allowed raw.githubusercontent.com and developer.apple.com, but blocked linear.app, raycast.com, zed.dev, readest.com, sioyek.info, sumatrapdfreader.org and culturedcode.com. So:
- Zed, Readest, Sioyek and Raycast's developer docs were read **directly from source files on GitHub (main branch, fetched 2026-11-05)**. Those numbers are primary and exact.
- Linear, Raycast blog, SumatraPDF docs and Things findings come from **search-result snippets of the primary pages**, not full-page reads. They are marked "(snippet)". Verify them before quoting.
- Arc/Dia and Craft: nothing reliable was retrieved. They are listed under Gaps.

## 1. Minimal chrome: hide-on-idle toolbars, title bar integration, one primary action

### Takeaway
The best analogues show chrome only on intent. Readest hides its header and footer until the pointer enters a thin trigger zone (300 ms fade). Zed defaults its scrollbar to "auto" and its minimap to "never". Raycast funnels every secondary action into one ⌘K action panel, with exactly one primary (↵) and one secondary (⌘↵) action. Apple's HIG warns against custom window frames that imitate system ones.

### Cited Findings
- **Readest auto-hide header.** A header bar `h-11` (44px) sits absolutely over the page with `transition-[opacity,margin-top] duration-300`. When hidden it is `pointer-events-none opacity-0`. It shows when `hoveredBookKey === bookKey || isDropdownOpen`, so an open menu "pins" the bar visible (`header-bar-pinned`). Header buttons are ghost buttons at `h-8 w-8` (32px). — [Readest HeaderBar.tsx](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/app/reader/components/HeaderBar.tsx)
- **Readest hover-zone lesson.** A code comment records that the trigger strip "used to be a fixed 44px tall… with the page header off (compact 16px margin) it covered the first line of text and swallowed long presses on it (#5429)". Its height now "tracks the content top on every platform, so the strip can never reach past where the text starts and block a selection (#4977)". Hiding is deferred with a `setTimeout` so a pointer crossing between hover targets does not flicker the bar. — [Readest HeaderBar.tsx](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/app/reader/components/HeaderBar.tsx)
- **Readest auto-hide footer.** The footer is `h-[52px]` with `transition-[opacity,transform] duration-300`. Hidden state is `translate-y-full opacity-0`, visible is `translate-y-0 opacity-100`. It shares the same hover-key state as the header. — [Readest FooterBar.tsx](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/app/reader/components/footerbar/FooterBar.tsx)
- **Readest default page margins** are `marginTopPx: 44` and `marginBottomPx: 44`, the same as the header height, so revealed chrome overlays empty margin instead of text. — [Readest constants.ts](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/services/constants.ts)
- **Zed defaults.** `"scrollbar": { "show": "auto" }`, meaning shown only "if there's important information or follow the system's configured behavior". `"minimap": { "show": "never" }` is also the default. — [Zed default.json](https://raw.githubusercontent.com/zed-industries/zed/main/assets/settings/default.json)
- **Raycast primary and secondary actions.** "The first and second action become the primary and secondary action. They automatically get the default keyboard shortcuts assigned… `↵` for the primary and `⌘` `↵` for the secondary action." Other actions go into sections ("Copy", "Danger zone"). — [Raycast ActionPanel docs](https://raw.githubusercontent.com/raycast/extensions/main/docs/api-reference/user-interface/action-panel.md)
- **Raycast action bar (snippet).** The redesign added a bottom action bar to make ⌘K discoverable, since it "had been hidden behind a small button". The bar consolidates actions, toasts and navigation titles, and context-specific actions with their shortcuts sit on its right. "Compact Mode" hides the root list and suggestions. — [Raycast: A fresh look and feel](https://raycast.com/blog/a-fresh-look-and-feel); [Raycast Launch Week Summary](https://www.raycast.com/blog/launch-week-summary)
- **Raycast navigation titles.** "Avoid long titles… in the Jira extension, we use the issue key instead of the issue title to keep it short." Also: "Avoid updating the navigation title multiple times on one screen." — [Raycast store guidelines](https://raw.githubusercontent.com/raycast/extensions/main/docs/basics/prepare-an-extension-for-store.md)
- **Linear 2026 refresh (snippet).** Navigation sidebars were made "a bit dimmer so the main content stands out". Icons were redrawn and resized, with fewer and smaller icons overall. Headers and view controls were made consistent. Softer borders and fewer separators reduce visual noise. — [Linear changelog 2026-03-12 UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh); [Linear: Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- **Apple HIG, windows.** "Avoid creating custom window UI… Avoid making custom window frames or controls, and don't try to replicate the system-provided appearance. Doing so without perfectly matching the system's look and behavior can make your app feel broken." Also: "Make sure window controls don't overlap toolbar items… move them inward when the window controls appear." — [Apple HIG: Windows](https://developer.apple.com/design/human-interface-guidelines/windows)
- **SumatraPDF (snippet).** It keeps a sparse toolbar and routes everything else through a Ctrl+K command palette (3.4+). Reviewers note "there isn't a corresponding UI button for every option". — [SumatraPDF Command Palette docs](https://www.sumatrapdfreader.org/docs/Command-Palette.md); [Dedoimedo review](https://www.dedoimedo.com/computers/sumatra-pdf.html)

### Inferences
- For Hold My Brief: hide the title/control bar and progress footer at rest and reveal them on hover of a trigger strip. Make the strip no taller than the top/bottom text margin. Keep the bar pinned while any popover (theme menu, library drawer) is open, and debounce the hide by about 100–200 ms.
- Make the page margin equal the bar height (Readest uses 44px/44px) so a revealed bar never covers text.
- Each surface gets one primary keyboard action (↵ opens the selected doc; ⌘↵ for the secondary). Everything else lives in the command palette, not in buttons.
- On macOS use the native traffic lights (Tauri `titleBarStyle: Overlay`) with leading-edge inset, rather than drawing fake ones.
- Dim secondary chrome such as the library drawer against the reading surface, following Linear's dimmer sidebar.

### Gaps
- Arc/Dia title bar and sidebar auto-hide specifics: not retrieved (sites blocked, no reliable snippets).
- Apple Preview/Books toolbar behavior: no primary source retrieved beyond the HIG windows page.

## 2. Typography and spacing systems, including published tokens

### Takeaway
Zed publishes the most concrete open token set: a 4px-based spacing scale with three density variants, UI text at 16/14/12/10px, and headline steps at 0.88–1.43rem with 1.6 line height. Linear's 2024 system reduced theming to three LCH inputs (base, accent, contrast). Readest defaults to 16px body text, with line height 1.4 or 1.6 depending on the profile.

### Cited Findings
- **Zed DynamicSpacing.** Tuples are (compact, default, comfortable) in px: (0,0,0), (1,1,2), (1,2,4), (2,3,4), (2,4,6), (3,6,8), (4,8,10), (10,12,14), (14,16,18), (18,20,22). Bare values are 24, 32, 40 and 48, derived by the formula (n−4, n, n+4), e.g. "24 => Compact: 20px, Default: 24px, Comfortable: 28px". Three densities are offered: Compact, Default, Comfortable. The code comment says "Always use [DynamicSpacing] for spacing values." — [Zed spacing.rs](https://raw.githubusercontent.com/zed-industries/zed/main/crates/ui/src/styles/spacing.rs)
- **Zed TextSize.** Large 16px, Default 14px, Small 12px, XSmall 10px, plus user-set `Ui` and `Editor` sizes. **HeadlineSize** in rems: XSmall 0.88, Small 1.0, Medium 1.125, Large 1.27, XLarge 1.43, all with line height 1.6rem. — [Zed typography.rs](https://raw.githubusercontent.com/zed-industries/zed/main/crates/ui/src/styles/typography.rs)
- **Zed default `ui_font_size`** is 16. — [Zed default.json](https://raw.githubusercontent.com/zed-industries/zed/main/assets/settings/default.json)
- **Zed themes.** Themes are JSON files, and users can override individual theme keys via `theme_overrides` in settings. — [Zed docs/src/themes.md](https://raw.githubusercontent.com/zed-industries/zed/main/docs/src/themes.md)
- **Linear 2024 (snippet).** Linear rebuilt theme generation in LCH instead of HSL. Instead of defining 98 variables per theme, it sets three: base, accent and contrast. Aliases for surfaces, text, icons and controls are generated from those three. The team reportedly used Inter Display for headings and regular Inter elsewhere; this detail was not confirmed from the full post. — [Linear: How we redesigned the Linear UI](https://linear.app/blog/how-we-redesigned-the-linear-ui); [Linear changelog 2024-03-20](https://linear.app/changelog/2024-03-20-new-linear-ui)
- **Linear 2026 (snippet).** The team found that "going too warm made the interface look muddy", and anyone at Linear could test combinations through a color tool in the dev toolbar. — [Linear: Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- **Readest reader defaults.** `defaultFontSize: 16`; `lineHeight: 1.4` in one profile and `1.6` in another. Bundled fonts are Bitter, Fira Code, Inter, Literata, Merriweather, Noto Sans and Roboto (plus CJK fonts). — [Readest constants.ts](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/services/constants.ts); [Readest README](https://raw.githubusercontent.com/readest/readest/main/README.md)
- **Sioyek themes are three RGB floats:** `background_color 0.97 0.97 0.97`, `dark_mode_background_color 0.0 0.0 0.0`, `custom_background_color 0.180 0.204 0.251`. Off-white is the default instead of pure white. — [Sioyek prefs.config](https://raw.githubusercontent.com/ahrm/sioyek/main/pdf_viewer/prefs.config)
- **Raycast.** Use Title Case for actions ("✅ Open in Browser… ❌ Copy url"). Add an ellipsis for submenu actions ("Set Priority…") without repeating the parent's name. Either every action has an icon or none does. — [Raycast store guidelines](https://raw.githubusercontent.com/raycast/extensions/main/docs/basics/prepare-an-extension-for-store.md)

### Inferences
- Adopt a Zed-like token ladder: 2/4/6/8/12/16/20/24/32px spacing; 12px for meta and footer, 14px for UI, 16px for headline and default body. Offer a single density toggle (compact/default) rather than many sliders.
- Generate all theme tokens from 2–3 inputs (Linear's base/accent/contrast in OKLCH or LCH). That keeps the theme list short and every theme consistent.
- Default light paper to an off-white (Sioyek 0.97 ≈ #F7F7F7) and keep a true-black dark option for OLED.

### Gaps
- Linear's exact type sizes and weights, and Raycast's internal spacing tokens: not published in any source I could reach.
- Craft and Things typography specs: not retrieved.

## 3. Command palette conventions: ranking, keyboard hints, sections

### Takeaway
Zed ranks recently and frequently used commands above everything else, then applies fuzzy matching with a length penalty. Each row shows the command's keybinding right-aligned, and the footer offers to change the selected command's binding. Raycast groups actions into titled sections and puts the shortcut next to each one. SumatraPDF uses prefix characters to switch modes.

### Cited Findings
- **Zed ranking.** Commands are first sorted by `Reverse(usage)`, where usage is `(last_invoked, invocations)`, then by name. Fuzzy matching (`fuzzy_nucleo`, smart case, `LengthPenalty::On`) runs over that list, and matches that are previously used commands are pinned above the rest in usage order. Usage is counted only for palette invocations: "if a user already knows a keystroke for a command, they are unlikely to use a command palette to look for it." History can be turned off (`use_command_history`). — [Zed command_palette.rs](https://raw.githubusercontent.com/zed-industries/zed/main/crates/command_palette/src/command_palette.rs)
- **Zed rows and footer.** The highlighted label (matched characters emphasized, truncated) sits on the left. On the right are the `KeyBinding` for the action and, for used commands, a "remove from history" button. The footer shows "Change Keybinding…" with a 12px keybinding hint. The placeholder is "Execute a command...". Up/down in an empty query cycles past queries. Query normalization turns underscores into spaces so both `go to line` and `go_to_line` match. — [Zed command_palette.rs](https://raw.githubusercontent.com/zed-industries/zed/main/crates/command_palette/src/command_palette.rs)
- **Raycast.** `ActionPanel.Section` groups related actions, e.g. a "Copy" section and a "Danger zone" section. Primary and secondary actions get default shortcuts automatically, and "while you can specify an alternative shortcut for the primary and secondary actions, it won't be displayed in the Action Panel." — [Raycast ActionPanel docs](https://raw.githubusercontent.com/raycast/extensions/main/docs/api-reference/user-interface/action-panel.md)
- **Raycast subtitles are indexed** for search but should not repeat the title: "If your subtitle is almost a duplication of your command title, you probably don't need it." — [Raycast store guidelines](https://raw.githubusercontent.com/raycast/extensions/main/docs/basics/prepare-an-extension-for-store.md)
- **SumatraPDF (snippet).** Ctrl+K opens a palette for nearly all commands. In 3.6 the default view became commands only, no longer mixing tabs, history and commands. Prefixes `@`, `#` and `>` switch modes. — [SumatraPDF Command Palette docs](https://www.sumatrapdfreader.org/docs/Command-Palette.md); [Neowin SumatraPDF 3.6](https://www.neowin.net/software/sumatrapdf-36/)
- **Sioyek.** "Quick Open" lets you "search and open any file you have previously interacted with", which makes recency the library index. — [Sioyek README](https://raw.githubusercontent.com/ahrm/sioyek/main/README.md)

### Inferences
- Hold My Brief palette: show recents first (palette-invoked only), then fuzzy matches with a length penalty, with the right-aligned shortcut chip on each row. Use prefixes to switch scope (for example `>` commands, `@` documents, `#` page or heading), and default to commands only, as Sumatra 3.6 does.
- Group sections by verb (Open, View, Window: Pin/Size Lock, Theme). Use Title Case and a trailing "…" for items that open a sub-list (e.g. "Theme…").
- Show a footer hint for the selected row (↵ Run · ⌘↵ secondary) instead of a help panel.

### Gaps
- Linear's ⌘K ranking algorithm: no primary source retrieved.
- Raycast root search ranking (frecency formula): not published in accessible docs.

## 4. Progress, page navigation and library views in small windows

### Takeaway
Readest's default is a small fraction-style progress label, with remaining time, remaining pages and a sticky progress bar all off. The fixed 52px footer appears only on hover. Sioyek relies on keyboard navigation (marks, quick open, ruler) instead of visible controls. Recency-based quick open replaces a heavyweight library view in both Sioyek and Sumatra.

### Cited Findings
- **Readest view defaults.** `showHeader: true`, `showFooter: true`, `showProgressInfo: true`, `progressStyle: 'fraction'`, `showRemainingTime: false`, `showRemainingPages: false`, `showStickyProgressBar: false`. — [Readest constants.ts](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/services/constants.ts)
- **Readest progress math.** For fixed-layout formats (PDF) progress uses `section`; for reflowable formats it uses `pageinfo`. The fraction is `(current + 1) / total` and is only shown when `total > 0`. — [Readest FooterBar.tsx](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/app/reader/components/footerbar/FooterBar.tsx)
- **Readest modes.** "Scroll/Page View Modes: Switch between scrolling or paginated reading modes"; full-text search across a book or the current library shelf; sync of progress across platforms. — [Readest README](https://raw.githubusercontent.com/readest/readest/main/README.md)
- **Sioyek navigation.** Marks are single-character named locations: lowercase marks are local to the document, uppercase are global. "Smart Jump" and "Overview" (right-click a reference to preview a figure or citation) work even without PDF links. Portals show linked destinations in a separate window. — [Sioyek README](https://raw.githubusercontent.com/ahrm/sioyek/main/README.md)
- **Sioyek prefs.** `move_screen_ratio 0.5` (a page-move scrolls half a screen), `ruler_mode 1` (a reading ruler or visual mark, `visual_mark_color 0 0 0 0.1`, i.e. 10% black), `fit_to_page_width_ratio 0.75`, `prerender_next_page_presentation 1`, `super_fast_search 1`. — [Sioyek prefs.config](https://raw.githubusercontent.com/ahrm/sioyek/main/pdf_viewer/prefs.config)

### Inferences
- Progress footer at rest: one muted 12px line such as "12 / 48" or "25%". Expose remaining time and the bar as opt-in. A 1–2px sticky bar at the window edge can serve as the only always-visible progress cue when the footer is hidden.
- In small windows, scroll by about half a viewport per keypress (Sioyek's 0.5), so the reader keeps a line of context.
- Library drawer: put Recents first, with fuzzy search via the palette (`@`). Avoid a grid of covers at compact sizes.
- A low-alpha reading ruler (around 10%) is a cheap "premium" touch for the tall-and-narrow pinned window.

### Gaps
- Apple Books/Preview page-navigation specs (thumbnail sidebar widths, page indicator behavior): not retrieved.
- SumatraPDF's minimum-window behavior and its home-page "frequently read" grid details: not retrieved (site blocked).

## 5. Empty states, first run and settings: how little do they show?

### Takeaway
The principle across sources is to never flash an empty state, show cached or partial data instead of errors, put settings in the standard preferences surface, and keep defaults sensible enough that most settings stay hidden.

### Cited Findings
- **Raycast.** "Common mistake — 'flickering empty state view' on start… make sure not to return an empty list of items before you get the data… In the meantime, you can show the loading indicator." Use `List.EmptyView` to customize real empty states. "Don't leave the search bar without a placeholder." — [Raycast store guidelines](https://raw.githubusercontent.com/raycast/extensions/main/docs/basics/prepare-an-extension-for-store.md)
- **Raycast errors.** "You should aim not to disrupt the user's flow just because something went wrong… if a network request fails but you can read the cache, show the cache… In most cases, it's best to show a Toast." — [Raycast best practices](https://raw.githubusercontent.com/raycast/extensions/main/docs/information/best-practices.md)
- **Raycast settings.** "You should not build separate commands for configuring your extension." Required preferences are asked for at first launch only if needed (`required: true`). — [Raycast store guidelines](https://raw.githubusercontent.com/raycast/extensions/main/docs/basics/prepare-an-extension-for-store.md)
- **Zed and Sioyek** keep advanced configuration in text files (`settings.json`; `prefs_user.config`/`keys_user.config`) with documented defaults, rather than exposing everything in a GUI. — [Zed default.json](https://raw.githubusercontent.com/zed-industries/zed/main/assets/settings/default.json); [Sioyek README](https://raw.githubusercontent.com/ahrm/sioyek/main/README.md)

### Inferences
- First run: one drop target or "Open…" (⌘O) line plus a hint "⌘K for everything". No tour.
- The settings pane should cover only theme, font size/density, and pin/size-lock defaults. Everything else goes in the palette or a config file.
- While loading, show a skeleton or the last-read page rather than an empty "No documents" view. Report failures as toasts.

### Gaps
- Things 3 and Craft onboarding specifics: not retrieved from primary sources.

## 6. Motion: durations, easing and reduced motion

### Takeaway
Zed's whole UI motion vocabulary is three durations (50/150/300 ms) with ease-out-quint, and its default slide-in starts at 40% opacity. Readest uses 300 ms for chrome reveal and gates nonessential animation behind `prefers-reduced-motion`. Apple's HIG asks for brief, cancellable motion and no motion on frequent interactions.

### Cited Findings
- **Zed AnimationDuration.** `Instant = 50`, `Fast = 150`, `Slow = 300` (ms). The default `animate_in` uses `Fast` with `ease_out_quint()`, starts at opacity 0.4, and travels 40px from the chosen edge (top/bottom/left/right). — [Zed animation.rs](https://raw.githubusercontent.com/zed-industries/zed/main/crates/ui/src/styles/animation.rs)
- **Readest.** Header and footer reveal take `duration-300`. Window buttons use `transition duration-200 ease-in-out hover:scale-105`. Under `@media (prefers-reduced-motion: reduce)`, root view-transition animations are cut to 0.15s and decorative animations get `animation: none; display: none`. Full-speed loading dots are applied only under `prefers-reduced-motion: no-preference`. — [Readest globals.css](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/styles/globals.css); [Readest HeaderBar.tsx](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src/app/reader/components/HeaderBar.tsx)
- **Apple HIG, motion.** "Add motion purposefully… Don't add motion for the sake of adding motion." "Make motion optional… avoid using it as the only way to communicate important information." "Aim for brevity and precision in feedback animations." "In apps, generally avoid adding motion to UI interactions that occur frequently." "Let people cancel motion… don't make people wait for an animation to complete." — [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- **Things 3 (secondary, snippet).** Reviewers single out the draggable Magic Plus button's animation and the completion animation as delight moments. Version 3.22 reportedly added deformation during drag. These are not primary sources. — [MacStories review](https://www.macstories.net/?p=48965); [Blake Crosley design study](https://blakecrosley.com/blog/design-study-things)

### Inferences
- Token set for Hold My Brief: `--dur-instant: 50ms`, `--dur-fast: 150ms` (popovers, palette, hover), `--dur-slow: 300ms` (chrome reveal, drawer), with ease-out-quint `cubic-bezier(0.22, 1, 0.36, 1)`. The cubic-bezier is a standard approximation, not taken from Zed's source.
- Do not animate page turns or scroll steps (frequent interactions, per the HIG). Under reduced motion, change opacity only, with no translate and at most 150 ms, the way Readest shortens to 0.15s.

### Gaps
- Linear's and Raycast's actual motion durations and easing: not published in any source reached.
- Things' own motion specs: no primary source.

## 7. Published principles on restraint and polish

### Takeaway
Primary statements are short. Linear's refresh treats calm, consistency and content precedence as its goals. Cultured Code's widely quoted motto is "We believe simple is hard". Apple's HIG says to avoid gratuitous motion and custom window chrome. Raycast's guidelines reject inconsistency (mixed icons, custom navigation stacks).

### Cited Findings
- **Linear 2026 (snippet).** The refresh is framed as a "calmer, more consistent interface". The dimmer sidebar lets content take precedence, and there are fewer and smaller icons and fewer separators. — [Linear changelog 2026-03-12](https://linear.app/changelog/2026-03-12-ui-refresh); [Linear: Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- **Cultured Code (secondary, snippet).** "We believe simple is hard", quoted via the Apple "Meet the Developer" story. — [Blake Crosley design study](https://blakecrosley.com/blog/design-study-things); [App Store story](https://apps.apple.com/us/story/id1462498106)
- **Raycast.** "Avoid introducing your own navigation stack. Extensions that just replace the view's content when it's expected to push a new screen will be rejected." "Avoid having a list of actions where some have icons and some don't." — [Raycast store guidelines](https://raw.githubusercontent.com/raycast/extensions/main/docs/basics/prepare-an-extension-for-store.md)
- **Apple HIG.** "Gratuitous or excessive animation can distract people and may make them feel disconnected or physically uncomfortable." — [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- **Zed.** Spacing must come only from tokens: "Always use [DynamicSpacing] for spacing values", and density must not be used to compute spacing ad hoc. — [Zed spacing.rs](https://raw.githubusercontent.com/zed-industries/zed/main/crates/ui/src/styles/spacing.rs)

### Inferences
- "Polish" in these teams mostly comes down to consistency enforced by a small token set, plus subtraction (dimmer, fewer, smaller), rather than added effects.
- A concrete cut list for Hold My Brief: remove always-visible toolbars, mixed icon and text buttons, duplicate entry points for the same action (button plus menu plus palette), and decorative motion.

### Gaps
- Linear's "quality" or craft essays (e.g. by Karri Saarinen): not fetched (linear.app blocked); full text unverified.
- Arc/Dia (The Browser Company) design principles, and Craft's design notes: no reliable sources retrieved.
- Raycast designer talks from 2023–2026 (e.g. a Dive Club episode at Config London 2025): found but content not retrieved — [Podwise listing](https://podwise.ai/episodes/6521540).
