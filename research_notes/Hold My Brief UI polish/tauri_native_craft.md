# Tauri 2 native craft on macOS and Windows: making a small always-on-top reader feel native and fast

Scope note: the session could not reach v2.tauri.app (DNS blocked), and the GitHub REST API was refused for tauri-apps repositories. Primary material therefore came from: the Tauri config JSON schema and docs sources on raw.githubusercontent.com (tauri `dev` branch, crate version 2.12.5 at time of fetch); the window-vibrancy and tauri-plugin-window-state (2.5.1) sources; Readest's `src-tauri` source; GitHub issue pages read through WebFetch; and MDN content sources. The schema on `dev` can run slightly ahead of the latest published release, so check each field against the Tauri version you ship.

## Title bars: Overlay/hiddenTitle on macOS, traffic lights, decorations:false on Windows, drag regions, snap layouts

### Takeaway
On macOS, keep native decorations and use `titleBarStyle: "Overlay"` + `hiddenTitle: true` + `trafficLightPosition`. You keep native window behaviour (tiling, zoom, fullscreen) and draw your own header underneath. Expect the traffic lights to be reset by AppKit after title changes, resizes, theme changes and fullscreen exits. Polished apps (Readest) re-apply the position natively from Rust. On Windows, `decorations: false` with HTML controls is the norm, but Windows 11 snap layouts on the maximize button still don't work in stock Tauri 2. The issue is upstream in WebView2 and only hacky child-window workarounds exist.

### Cited Findings
- `TitleBarStyle` values are `Visible`, `Transparent` and `Overlay`. `Overlay` "shows the title bar as a transparent overlay over the window's content". The caveats are listed in the schema itself: title bar height differs between OS versions, so controls may not sit where you expect; you must define a custom drag region; "due to a limitation you can't drag the window when it's not in focus" (tauri#4316); and the title colour follows the system theme. `Transparent` "lets you avoid the caveats of using Overlay" if you don't need HTML under the title bar. — [Tauri config schema (dev)](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- `hiddenTitle`: "If true, sets the window title to be hidden on macOS." `trafficLightPosition`: "The position of the window controls on macOS. Requires titleBarStyle: Overlay and decorations: true." — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- The official docs warn that on macOS a fully custom titlebar (`decorations:false`) "will also lose some features provided by the system, such as moving or aligning the window". As an alternative they suggest a transparent titlebar (`TitleBarStyle::Transparent`) plus a custom NSWindow background colour via `objc2-app-kit` (`ns_window.setBackgroundColor`). — [Tauri docs: Window Customization (source)](https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/learn/window-customization.mdx)
- Custom titlebar recipe: set `decorations: false`, then grant the `core:window:allow-close`, `allow-minimize`, `allow-toggle-maximize` and `allow-start-dragging` capabilities. Mark the bar with `data-tauri-drag-region` and wire buttons to `getCurrentWindow().minimize()/toggleMaximize()/close()`. — [Tauri docs source](https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/learn/window-customization.mdx)
- "`data-tauri-drag-region` will only work on the element to which it is directly applied", so children need it too. This is deliberate, so buttons and inputs inside the bar keep working. For custom behaviour, call `appWindow.startDragging()` on `mousedown` with `e.buttons === 1`, and `toggleMaximize()` when `e.detail === 2`. — [Tauri docs source](https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/learn/window-customization.mdx)
- Windows tip from the docs: `*[data-tauri-drag-region] { app-region: drag; }` makes the title bar work with touch and pen input. — [Tauri docs source](https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/learn/window-customization.mdx)
- Open drag-region bugs: proxyUrl breaks `data-tauri-drag-region` on Windows ([#14858](https://github.com/tauri-apps/tauri/issues/14858)); it does not work in isolation mode ([#5868](https://github.com/tauri-apps/tauri/issues/5868)); and it misbehaves on Windows touchscreens ([#4746](https://github.com/tauri-apps/tauri/issues/4746)). Issue titles were seen via GitHub search; bodies were not read.
- Traffic-light bugs: "Setting window title resets traffic light position" ([#13044](https://github.com/tauri-apps/tauri/issues/13044), closed); "Custom traffic light position reset after quitting fullscreen of maximized window" ([#15451](https://github.com/tauri-apps/tauri/issues/15451), closed 2026); "traffic_light_position does not work with feature `unstable`" ([#14072](https://github.com/tauri-apps/tauri/issues/14072), open); "maximize window button is black with titleBarStyle overlay" ([#14253](https://github.com/tauri-apps/tauri/issues/14253), open); "Heavy app lag after double clicking custom titlebar (macos)" ([#15092](https://github.com/tauri-apps/tauri/issues/15092), open). Titles and states come from GitHub search.
- Readest, a Tauri ebook reader using foliate-js, uses `.decorations(true).title_bar_style(TitleBarStyle::Overlay).title("Readest")` on macOS. The title text is hidden, but the window keeps a real name for the Window menu and VoiceOver. On Windows and Linux it uses `.decorations(false).visible(false).shadow(...)`. — [Readest src-tauri/src/lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs)
- Readest ships its own `traffic_light` plugin. It centres the buttons vertically in its 44pt header with a 10pt x-inset, and re-applies the position on `ThemeChanged`, on resize and on fullscreen exit. The code notes that `-[NSWindow setTitle:]` makes AppKit restore the standard 28pt container, so buttons "visibly flicked between the two positions on every library <-> reader navigation (#6222)". Readest's fix is to set the title and re-position in the same main-thread pass. It also caches AppKit's natural `NSWindowButton.origin.y` because "Apple shifted [it] in Tahoe (~5pt on macOS 15, ~7pt on macOS 26)". — [Readest macos/traffic_light.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/macos/traffic_light.rs)
- Windows 11 snap layouts with `decorations:false` (tauri#4531): still open, labelled `status: upstream`. The flyout responds only to `WM_NCHITTEST` returning `HTMAXBUTTON`, which WebView2 does not deliver for clicks inside the webview. FabianLars (Mar 2024): "This won't be implemented for v2 since we're still blocked by webview2." Subclassing the main window's `WM_NCHITTEST` reportedly fails because WebView2's child window gets the hit test first. One reported workaround, verified on Win11 build 26200 with Tauri 2.11.5 (Jul 2026): place a transparent native child window over the HTML maximize button that returns `HTMAXBUTTON`. The issue was marked a duplicate of #12930 (titlebar overlay on Windows). — [tauri#4531](https://github.com/tauri-apps/tauri/issues/4531)
- Related open feature request: a custom titlebar with native window controls, like Electron's `titleBarOverlay` ([#9458](https://github.com/tauri-apps/tauri/issues/9458)). An open bug reports delayed webview resize when double-clicking the title bar ([#13898](https://github.com/tauri-apps/tauri/issues/13898)). — GitHub search results
- `shadow` on Windows: `false` has no effect on decorated windows. `true` gives undecorated windows a 1px white border, plus rounded corners on Windows 11. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Readest only enables the undecorated shadow on Windows 11 (build >= 22000, read from the registry). Its reason: "Windows 10 renders the native shadow of an undecorated window as a 1px border on the left, right and bottom edges but not the top, which reads as a broken frame (tauri-apps/tauri#13134)". — [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs)

### Inferences
- For a small always-on-top reader, the lowest-risk path is platform-split config. macOS: decorations on, `Overlay`, `hiddenTitle`, `trafficLightPosition` tuned to the header height. Windows: decorations off, an HTML caption-button cluster at the right (46px-wide buttons is the usual Windows convention, not verified here), and either accept no snap flyout or keep native decorations if snap matters. A tiny pinned reader rarely needs snap layouts, so the trade-off probably favours custom chrome.
- Because Overlay windows can't be dragged while unfocused (#4316), an always-on-top reader the user often grabs without focusing first may feel sticky. Consider `acceptFirstMouse`-style behaviour, or test it.
- If the app changes `document.title` or the window title per document, copy Readest's approach of re-applying the traffic-light position natively in the same pass. Otherwise expect a flicker.

### Gaps
- Exact Tauri release that fixed #13044 and #15451: closed state confirmed, fix version not read.
- Whether `trafficLightPosition` can now be set from JS (#13790 is closed; the resolution was not read).
- Microsoft Fluent caption-button metrics and Apple HIG title-bar specs were not fetched. Treat the 46px convention as unverified.
- tauri-plugin-decorum (a community plugin for Windows-style controls and traffic-light inset) is not mentioned in #4531, and its README was not checked.

## Vibrancy, Mica and Acrylic: window-vibrancy, `windowEffects`, transparency costs

### Takeaway
Tauri 2 exposes effects natively through `windowEffects` and `setEffects()`, so the separate window-vibrancy crate is only needed for advanced cases such as Liquid Glass with webview reparenting. Every effect requires `transparent: true` and a transparent `html, body`. On Windows, Mica is the safe choice. Acrylic and Blur are documented to perform badly when resizing or dragging. Transparency has real side effects on both platforms, so for a reader whose content is an opaque page, apply vibrancy only to chrome or skip it.

### Cited Findings
- `windowEffects`: "Requires the window to be transparent." On Windows, with decorations or shadows, see the workaround at tao#72. Linux is unsupported. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- `WindowEffectsConfig` fields:
  - `effects`: a list. Conflicting effects apply the first one, except that on macOS you can list one Liquid Glass style and one Visual Effect material together, and Tauri falls back to the material on macOS 15 and below.
  - `state`: macOS only, ignored for Liquid Glass.
  - `radius`: macOS only.
  - `color`: on Windows, affects Blur and Acrylic only on Windows 10 v1903+, with no effect on 7 or 11. On macOS, it affects only Liquid Glass.
  - `interactive`: macOS 27.0+, Liquid Glass only.
  — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- `WindowEffect` enum:
  - macOS materials: `titlebar`, `selection`, `menu`, `popover`, `sidebar`, `headerView`, `sheet`, `windowBackground`, `hudWindow`, `fullScreenUI`, `tooltip`, `contentBackground`, `underWindowBackground`, `underPageBackground`. The `appearanceBased`, `light`, `dark`, `mediumLight` and `ultraDark` values are deprecated.
  - macOS 26+: `liquidGlassRegular`, `liquidGlassClear`.
  - Windows 11 only: `mica`, `micaDark`, `micaLight`, `tabbed`, `tabbedDark`, `tabbedLight`.
  - `blur` (Windows 7/10/11 22H1) and `acrylic` (Windows 10/11): both carry a note about "bad performance when resizing".
  — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- The JS API has `getCurrentWindow().setEffects({...})`. — [packages/api/src/window.ts](https://raw.githubusercontent.com/tauri-apps/tauri/dev/packages/api/src/window.ts)
- window-vibrancy crate:
  - `apply_blur`: Windows 7/10/11 (22H1 only); "Bad performance when resizing/dragging the window on Windows 11 build 22621+".
  - `apply_acrylic`: "Bad performance when resizing/dragging the window on Windows 10 v1903+ and Windows 11 build 22000".
  - `apply_mica`: Windows 11, with no perf note.
  - `apply_vibrancy`: macOS 10.10+.
  - `apply_liquid_glass`: macOS 26+, with `.radius()`, `.opaque()`, `.interactive()` (macOS 27+) and `.content_view(webview)` to reparent the WKWebView into the glass view.
  - Use crate v0.4 for Tauri v1.
  - Tauri checklist: `html, body { background: transparent }`, `"transparent": true`, and on macOS `"macOSPrivateApi": true`.
  — [window-vibrancy README](https://raw.githubusercontent.com/tauri-apps/window-vibrancy/dev/README.md)
- `app.macOSPrivateApi`: "Enables the transparent background API and sets the fullScreenEnabled preference to true. No-op in Tauri 2.12.1+ because the APIs are always enabled now." Historically, enabling private APIs blocks Mac App Store acceptance (from memory, not verified this session). — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Windows transparency side effects:
  - tauri#13270 (open): `transparent: true` actually improves resize smoothness and removes black/white edge bars on Windows, but a commenter saw "noticeable flicker on initial page load in release .exe builds". Another reported a 1-2 frame desktop show-through when entering or leaving fullscreen on Windows 10 (Tauri 2.12.1).
  - The suggested mitigation is to start hidden and show from a frontend-ready command.
  — [tauri#13270](https://github.com/tauri-apps/tauri/issues/13270)
- tauri#15490: a white flash on every `window.show()` with `decorations(false)` + `transparent(true)` on Windows (Tauri 2.11.2, WebView2 148). It was closed as a duplicate of #14831, an upstream WebView2 composition bug. The reporter says PR #15410 adds a `no_redirection_bitmap` API, expected in 2.12.0. The schema's `transparent` docs now say: "Windows: Using `noRedirectionBitmap` can help avoid a white flash when creating a transparent window." — [tauri#15490](https://github.com/tauri-apps/tauri/issues/15490); [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Linux caution from Readest: "A transparent WebKitGTK window ... composites as fully transparent whenever its web process is too busy to repaint ... so the app 'turns invisible'". Readest keeps Windows (`transparent(false)`) and Linux opaque. — [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs)
- macOS: an open issue reports that CSS `backdrop-filter` blur doesn't behave the same in Tauri's WKWebView as in Safari ([#13801](https://github.com/tauri-apps/tauri/issues/13801)). Title only; body not read.

### Inferences
- For a reader, the typical polished pattern is an opaque content surface (better text contrast, cheaper compositing) with vibrancy only behind a sidebar or toolbar. With Tauri's window-level effects, that means a transparent window with opaque CSS panels over the reading area.
- Mica samples the desktop wallpaper rather than content behind the window, so it is cheaper than Acrylic. That fits the "Mica OK, Acrylic slow" notes above. This reasoning comes from general Windows knowledge, not a source fetched this session.
- An always-on-top window that is frequently shown and hidden on Windows is exactly the #15490 pattern. If you go transparent, use `noRedirectionBitmap` (2.12+), or move the window off-screen instead of hiding it.

### Gaps
- No measured GPU or CPU cost numbers for vibrancy, Mica or Acrylic in Tauri were found.
- The exact JSON key and Tauri version for `noRedirectionBitmap` were not confirmed beyond the schema mention.
- Mac App Store implications of `macOSPrivateApi` in 2.12.1+ (now "always enabled") were not verified.

## Startup time: white flash, background colour, bundle size, lazy-loading engines

### Takeaway
The flash comes from the webview's default white surface painting before your CSS. The fix has three layers: set `backgroundColor` in the window config to match the theme; inline the matching `background` and `color-scheme` in `index.html`; and create the window with `visible: false`, showing it only once the frontend signals it has painted, with a timeout fallback. Readest is a production reference implementation. Tauri bundles are small (single-digit MB for a basic app). Published startup and memory comparisons with Electron are inconsistent and mostly N=1.

### Cited Findings
- `backgroundColor`: "Set the window and webview background color." On Windows, alpha is ignored for the window layer, and on Windows 8+ a non-zero alpha is ignored for the webview layer. `visible`: "Whether the window is visible or not." — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Long-standing issue: the WebKit white background on startup ([tauri#1564](https://github.com/tauri-apps/tauri/issues/1564)). A user reported that `"visible": false`, then showing from Rust, works around the flash ([tauri#5747](https://github.com/tauri-apps/tauri/issues/5747)). A community PR sets a dark `backgroundColor` and inlines the matching background and `color-scheme` in `index.html` "so the first HTML paint is dark too" ([Nembrix PR #110](https://github.com/Nembrix/nembrix/pull/110)). Summaries come from search snippets.
- Readest's pattern:
  - The main window is built with `.background_color(Color(50,49,48,255))` (white on e-ink devices) and `.visible(false)` on Windows/Linux.
  - Window-state restore runs with `StateFlags::all() & !StateFlags::VISIBLE`, because the plugin "would otherwise show the window at the end of the restore — before the webview has painted its first frame, which flashes the window background on dark hosts."
  - The window is shown when the frontend emits a `window-themed` event, "with a timeout fallback for the case where that event never arrives".
  — [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs)
- Readest also sets `.background_throttling(BackgroundThrottlingPolicy::Disabled)`. Tauri documents that browsers otherwise throttle timers and may suspend a hidden or minimized view after about 5 minutes. The setting is supported on macOS (version-gated) and iOS 17+; on Windows and Linux it is unsupported, and "a pending WebLock transaction" is suggested as a workaround. — [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs); [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Known interactions:
  - `requestUserAttention`/`focus` is broken with `visible:false` + multi-window on Windows ([#14322](https://github.com/tauri-apps/tauri/issues/14322)).
  - On the experimental CEF runtime on Linux, the window maps regardless of `visible(false)` ([#16205](https://github.com/tauri-apps/tauri/issues/16205), Oct 2026).
  - White gaps appear on resize or maximize on macOS ([#14288](https://github.com/tauri-apps/tauri/issues/14288)).
  — GitHub search titles
- window-state flicker on startup was reported as `window-state still flickers on the startup` ([plugins-workspace#3362](https://github.com/tauri-apps/plugins-workspace/issues/3362), closed 2026). The resolution was not read.
- Bundle size and startup numbers:
  - Hopp's single-run macOS test: Tauri 8.6 MiB vs Electron 244 MiB; about 172 MB vs 409 MB memory with six windows; startup difference "negligible". The author notes N=1. — [Hopp on DEV](https://dev.to/gethopp/tauri-vs-electron-performance-bundle-size-and-the-real-trade-offs-1el4)
  - Other comparisons: a Windows 11 test found the memory gap small (142 MB vs 149 MB private), and a 2026 comparison reported a 311 ms median launch-to-first-window for Tauri. The tech-insider pages appear to recycle Hopp's numbers, so treat them as unreliable. — [Better Stack comparison](https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/); [levminer](https://www.levminer.com/blog/tauri-vs-electron); [tech-insider](https://tech-insider.org/tauri-vs-electron-2026/)
- pdf.js builds two scripts, `pdf.js` and `pdf.worker.js`. "Only `pdf.js` needs to be included since `pdf.worker.js` will" be loaded by it. A `generic-legacy` build exists for older engines. — [pdf.js README](https://raw.githubusercontent.com/mozilla/pdf.js/master/README.md)

### Inferences
- Concrete recipe for this app:
  1. Set `visible: false` and a theme-matched `backgroundColor` in `tauri.conf.json`.
  2. Put `<meta name="color-scheme" content="light dark">` and inline `html{background:#xxx}` in `index.html`.
  3. Call `getCurrentWindow().show()` after first `requestAnimationFrame` post-theme. This needs the `core:window:allow-show` permission.
  4. Add a Rust-side timeout fallback of about 1-2 s.
- Lazy-load pdf.js and foliate-js with dynamic `import()` only when a document of that type is opened, so the first paint ships only the shell. Point `GlobalWorkerOptions.workerSrc` at a Vite `?url` import of `pdfjs-dist/build/pdf.worker.min.mjs`, or use `workerPort` with `new Worker(new URL(...), {type:'module'})`. These are standard pdfjs-dist patterns, not verified this session. Avoid the legacy build, because WKWebView and WebView2 are both modern engines.
- Turning off background throttling matters for an always-on-top reader that may sit occluded, if it runs timers such as autosave or reading-position sync. Otherwise leave the default for battery.
- Keep SQLite (rusqlite) open and warmed in Rust `setup` on a background thread, so the first IPC query is not paying open/migrate cost on the main thread (general practice; unsourced).

### Gaps
- No authoritative, reproducible cold-start benchmarks for Tauri 2 on WKWebView vs WebView2 were found. The available numbers are anecdotal.
- WebView2 runtime cold-start cost on first launch after boot (shared Edge runtime processes) was not measured or sourced.

## Window-state polish: plugin-window-state, multi-monitor, DPI, always-on-top across Spaces and fullscreen

### Takeaway
tauri-plugin-window-state (v2.5.1) handles size, position, maximized, visible, decorations and fullscreen. It only restores position if a monitor still intersects the saved rect, so a detached display falls back to OS placement. It stores physical pixels, though, and there are open DPI and scale-factor bugs. Exclude `VISIBLE` if you use the hidden-until-painted pattern. On macOS, `alwaysOnTop` + `visibleOnAllWorkspaces` is not enough to float over other apps' fullscreen Spaces in a built app. That needs an NSPanel (tauri-nspanel) or `LSUIElement`.

### Cited Findings
- Plugin API: `StateFlags` = `SIZE`, `POSITION`, `MAXIMIZED`, `VISIBLE`, `DECORATIONS`, `FULLSCREEN`. The default filename is `.window-state.json`. The builder offers `with_state_flags`, `with_filename`, `with_denylist`, `with_filter`, `skip_initial_state(label)` and `map_label`. JS has `saveWindowState(StateFlags.ALL)` and `restoreStateCurrent(...)`. The plugin requires Rust 1.90+. — [window-state README](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/window-state/README.md); [window-state lib.rs](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/window-state/src/lib.rs)
- Restore logic, read from source:
  - Position is applied only `if m.intersects(position, size)` for some available monitor ("otherwise, let the OS decide where to place the window").
  - Size is restored as `PhysicalSize`.
  - A maximized window restores its pre-maximize `prev_x/prev_y`.
  - With the `VISIBLE` flag, it calls `self.show()` and `self.set_focus()` at the end.
  — [window-state lib.rs](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/window-state/src/lib.rs)
- Open window-state bugs:
  - "macOS: restored window doubles in size and position when scale_factor() is still 1.0 during on_window_ready" ([#3521](https://github.com/tauri-apps/plugins-workspace/issues/3521), Jul 2026).
  - "Remember monitor" feature request ([#1282](https://github.com/tauri-apps/plugins-workspace/issues/1282)).
  - "Window State Position Error" ([#1988](https://github.com/tauri-apps/plugins-workspace/issues/1988)).
  - A Linux CSD window grows on every restart ([#3553](https://github.com/tauri-apps/plugins-workspace/issues/3553)).
  - A closed request asked for `LogicalSize` instead of `PhysicalSize` ([#2620](https://github.com/tauri-apps/plugins-workspace/issues/2620)).
  - Win11 sub-windows shrinking below min size ([#2326](https://github.com/tauri-apps/plugins-workspace/issues/2326), closed).
  — GitHub search titles
- Readest's Windows fix: a hidden undecorated window never re-runs tao's `WM_NCCALCSIZE`, so restored windows "grow by roughly one titlebar height per start (#6373)". Readest calls `SetWindowPos(... SWP_FRAMECHANGED|SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE)` before `restore_state`. It uses `skip_initial_state("main")` and restores manually. It sizes the first launch to min(1280x800, 90% of the monitor work area), because "a window that opens partly off-screen can be impossible to resize back". — [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs)
- `preventOverflow` keeps the window inside the monitor work area (desktop). `visibleOnAllWorkspaces` is unsupported on Windows, iOS and Android. `skipTaskbar` hides the taskbar icon on Windows and Linux. `focusable` and `focus` control initial focus. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Monitor API: the JS `Monitor` exposes `scaleFactor`, and the docs advise `monitor.size.toLogical(monitor.scaleFactor)`. `getCurrentWindow().scaleFactor()` exists. — [packages/api/src/window.ts](https://raw.githubusercontent.com/tauri-apps/tauri/dev/packages/api/src/window.ts)
- macOS always-on-top over fullscreen apps (tauri#9556, open):
  - In `tauri build`, an `alwaysOnTop` window stays on its original Space and can't draw over fullscreen apps.
  - Maintainer ahkohd: not a Tauri bug, because only `NSPanel` windows can draw over fullscreen windows. He recommends the `tauri-nspanel` plugin, and panels also don't steal focus.
  - `ActivationPolicy::Accessory` alone didn't help one reporter. `LSUIElement=true` in Info.plist worked but makes the whole app float or agent-like, and "Apple may just disable the behaviour".
  - The report is against Tauri 1.6, but the mechanism is AppKit-level.
  — [tauri#9556](https://github.com/tauri-apps/tauri/issues/9556)
- Other always-on-top bugs: the window changes position when AlwaysOnTop + AcceptFirstMouse is combined with a normal window ([#6568](https://github.com/tauri-apps/tauri/issues/6568)); `setAlwaysOnTop` not working ([#9439](https://github.com/tauri-apps/tauri/issues/9439)); can't create a non-focused window on macOS ([#9065](https://github.com/tauri-apps/tauri/issues/9065)). — GitHub search titles

### Inferences
- Recommended setup: `tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)`, so the frontend decides when to show. Persist the always-on-top flag and opacity yourself, either in rusqlite or the plugin store; window-state doesn't cover them.
- On restore, also clamp the window to the current monitor's work area, because the plugin only checks intersection, which a sliver counts as. Re-check on `onScaleChanged` and monitor changes.
- If "float over fullscreen apps on every Space" is a core feature on macOS, plan for tauri-nspanel (NSPanel with `canJoinAllSpaces`/`fullScreenAuxiliary`-style collection behaviour) rather than plain `alwaysOnTop`. Treat it as a macOS-only code path.

### Gaps
- The tauri-nspanel README and current v2 API were not fetched, and the exact NSWindowCollectionBehavior flags it sets were not verified.
- Whether `visibleOnAllWorkspaces` alone (without NSPanel) now works over fullscreen Spaces in Tauri 2.12 was not confirmed.
- Windows always-on-top vs fullscreen games and exclusive-fullscreen apps was not researched.

## Fonts, scrolling, selection, cursors and focus rings in WKWebView vs WebView2

### Takeaway
Use the system font stack (`system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", sans-serif`) for chrome. Apply `-webkit-font-smoothing` thoughtfully: it only works on macOS, and `antialiased` makes text look lighter. Disable selection and use `cursor: default` on chrome only, never on the reading surface. Use `overscroll-behavior: none` on the root to kill rubber-banding on chrome. Follow the native convention that buttons show an arrow cursor, not a hand. Tauri 2 also offers a native Fluent overlay scrollbar on Windows.

### Cited Findings
- `-webkit-font-smoothing` "only works on macOS". `antialiased` gives pixel-level rather than subpixel smoothing: "Switching from subpixel rendering to anti-aliasing for light text on dark backgrounds makes it look lighter". `subpixel-antialiased` is sharpest on most non-retina displays. MDN links David Bushell's 2024 piece "What's the deal with WebKit Font Smoothing?". — [MDN font-smooth (source)](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/properties/font-smooth/index.md)
- `overscroll-behavior`: `contain` prevents scroll chaining but bounce may still occur; `none` prevents both chaining and bounce. It applies only to scroll containers, and has no effect on an iframe. — [MDN overscroll-behavior (source)](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/properties/overscroll-behavior/index.md)
- CSS system colours include `AccentColor` and `AccentColorText`. "To reduce the risk of fingerprinting, some browsers return a fixed value for AccentColor and AccentColorText unless they are used in certain restricted circumstances." — [MDN system-color (source)](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/values/system-color/index.md)
- `scrollBarStyle: "fluentOverlay"` gives Fluent UI overlay scrollbars on Windows. It requires WebView2 Runtime 125.0.2535.41+ and must be the same for all webviews sharing a data directory. It is a no-op elsewhere. Readest uses `.scroll_bar_style(ScrollBarStyle::FluentOverlay)` on Windows. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json); [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs)
- `zoomHotkeysEnabled`: on Windows it controls WebView2's `IsZoomControlEnabled`; on macOS it injects a Ctrl/Cmd +/- polyfill (20% steps). `allowLinkPreview` (macOS/iOS long-press link preview) is on by default. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- `dragDropEnabled`: Tauri replaces WebView2's drag-drop handler, so on Windows you must disable it to use HTML5 drag and drop in the frontend. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json)
- Community native-feel tips: set `user-select: none` on the base element to stop accidental selection, and `cursor: default` on body to remove the I-beam over UI text. Re-enable selection in inputs and content. Follow OS light/dark. — [DEV: 8 tips for native look and feel in Tauri](https://dev.to/akr/8-tips-for-creating-a-native-look-and-feel-in-tauri-applications-3loe) (single-author opinion, via search summary)

### Inferences
- Suggested base CSS:
  - `:root { color-scheme: light dark; font: 13px/1.4 system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", sans-serif; }`.
  - `html, body { overscroll-behavior: none; }`.
  - `.chrome { user-select: none; -webkit-user-select: none; cursor: default; }`.
  - Keep `.reader { user-select: text; }`.
  - Use `:focus-visible` (not `:focus`) for rings, with `outline: 2px solid AccentColor` where supported and a fallback colour.
  - On macOS, consider `-webkit-font-smoothing: antialiased` only for light-on-dark chrome; leave body text at default.
  - 13px is the macOS default body size per general HIG knowledge (unverified here). Windows Fluent body text is 14px Segoe UI Variable (unverified).
- WebKit needs `-webkit-user-select` (prefixed) for full coverage; WebView2 (Chromium) supports the unprefixed form. This is general web-compat knowledge.
- Given the AccentColor fingerprinting caveat, verify in both engines whether it returns the real OS accent. If not, read it natively in Rust and inject it as a CSS variable: `NSColor.controlAccentColor` on macOS, `UISettings.GetColorValue(Accent)` or DWM colorization on Windows.
- foliate-js renders EPUB content in iframes. `overscroll-behavior` on the parent won't affect iframe scrolling, so set it inside the iframe document too.

### Gaps
- Not verified: variable font (`font-variation-settings`, `opsz`) behaviour differences between WKWebView and WebView2; whether WebView2 exposes Segoe UI Variable optical sizes automatically via `system-ui`; and `text-rendering: optimizeLegibility` costs.
- Not verified: whether `AccentColor` resolves to the real OS accent in WKWebView or WebView2 inside Tauri.
- Apple HIG and Fluent focus-ring specs were not fetched.

## Native context menus vs HTML menus; reduced motion, accent colour and dark mode

### Takeaway
Tauri 2 has a first-class menu API in both JS (`@tauri-apps/api/menu`) and Rust, including `PredefinedMenuItem` (copy, cut, paste, undo, redo, select-all, separator), check items and icon items. Context menus can be popped up natively, which gives true OS look, keyboard navigation and accessibility, so the old v1 community plugin is unnecessary. Dark mode is available through `theme` (config), `getCurrentWindow().theme()` and `onThemeChanged`. Reduced motion and accent colour must come from CSS media queries or native code.

### Cited Findings
- Menus are built with `Menu.new({ items })` in JS, or `MenuBuilder`, `SubmenuBuilder`, `CheckMenuItemBuilder` and `IconMenuItemBuilder` in Rust. `PredefinedMenuItem.new({ item: 'Copy' | 'Separator' | 'Undo' | 'Redo' | 'Cut' | 'Paste' | 'SelectAll' })` and the Rust `PredefinedMenuItem::copy(app, Some("custom text"))` provide OS-standard items. — [Tauri docs: Window Menu (source)](https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/learn/window-menu.mdx)
- "Official context menu support has been added in Tauri v2.x", so the GitButler `tauri-plugin-context-menu` is for v1. `tauri-plugin-shadcn-menu` offers a native NSMenu on macOS with a web fallback. — [gitbutlerapp/tauri-plugin-context-menu](https://github.com/gitbutlerapp/tauri-plugin-context-menu); [tauri-plugin-shadcn-menu docs.rs](https://docs.rs/crate/tauri-plugin-shadcn-menu/latest) (via search summary)
- Suppressing the default WebView context menu: `contextmenu` listener + `preventDefault()`. This removes copy/paste, so you need a replacement. — [Yaak feedback post](https://yaak.app/feedback/posts/disable-contextmenu-on-windows) (via search summary)
- `theme`: "The initial window theme. Defaults to the system theme. Only implemented on Windows and macOS 10.14+." The JS API has `theme()` and the `ThemeChanged` window event. Readest re-applies traffic-light layout on `WindowEvent::ThemeChanged`. — [Tauri config schema](https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json); [window.ts](https://raw.githubusercontent.com/tauri-apps/tauri/dev/packages/api/src/window.ts); [Readest traffic_light.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/macos/traffic_light.rs)
- `setBackgroundColor('#2f2f2f')` or an RGBA array is available at runtime for the window, and separately for the webview via `WebviewWindow.setBackgroundColor`. Use it to update the native surface colour on theme switches so resize gaps match. — [window.ts](https://raw.githubusercontent.com/tauri-apps/tauri/dev/packages/api/src/window.ts)

### Inferences
- Use native menus for right-click on chrome and on selected text: copy, "look up", highlight, and reader actions like font size or always-on-top toggle. They are faster to appear (no DOM), match OS styling and dark mode automatically, and handle keyboard and accessibility correctly. Keep HTML popovers only for rich UI such as TOC search or colour pickers.
- Respect `@media (prefers-reduced-motion: reduce)` and `(prefers-color-scheme: dark)` in CSS. Both are standard media queries supported by WKWebView and WebView2 (general knowledge; not fetched this session). Mirror the window `backgroundColor` on `onThemeChanged` to avoid mismatched resize gaps.

### Gaps
- The exact JS call for a native context-menu popup (`menu.popup()` and its position semantics) was not confirmed from the fetched docs excerpt; grep didn't surface "popup" in window-menu.mdx.
- Whether WKWebView and WebView2 propagate OS "reduce motion" and "increase contrast" (`prefers-contrast`) inside Tauri was not verified by a source.
- No official Tauri API for the OS accent colour was found.

## Polished open-source Tauri apps worth studying

### Takeaway
Readest is the most directly relevant reference: a Tauri 2 ebook reader built on foliate-js, with deliberate, well-commented native polish. Its code covers macOS overlay title bar and traffic-light management, hidden-until-themed startup, window-state DPI and frame fixes, Win10 vs Win11 shadow handling, Fluent scrollbars, and opaque windows on Linux. The other suggested apps create windows programmatically or keep config elsewhere, and their specifics weren't verified.

### Cited Findings
- Readest (apps/readest-app/src-tauri):
  - `BackgroundThrottlingPolicy::Disabled`.
  - Theme-matched `background_color`, with white for e-ink.
  - macOS Overlay title bar with hidden title text.
  - Windows/Linux undecorated, `visible(false)`, version-gated shadow.
  - Windows `transparent(false)` + `ScrollBarStyle::FluentOverlay`.
  - Window-state restored manually with `StateFlags::all() & !StateFlags::VISIBLE` and `skip_initial_state("main")`, after an `SWP_FRAMECHANGED` fix.
  - Window shown on a frontend `window-themed` event with a timeout fallback.
  - First-run size clamped to 90% of the work area.
  - Custom traffic-light plugin handling macOS 15 vs 26 offsets and title-change flicker.
  — [Readest lib.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/lib.rs); [Readest traffic_light.rs](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/src/macos/traffic_light.rs)
- Readest's `tauri.conf.json` declares `app.windows: []`, so all windows are created in Rust. Pake's and Clash Verge Rev's `tauri.conf.json` files have no `app.windows` either, so they also build windows programmatically. Cap's and Spacedrive's config paths returned 404 at the guessed locations. — [Readest tauri.conf.json](https://raw.githubusercontent.com/readest/readest/main/apps/readest-app/src-tauri/tauri.conf.json); [Pake tauri.conf.json](https://raw.githubusercontent.com/tw93/Pake/main/src-tauri/tauri.conf.json); [Clash Verge Rev tauri.conf.json](https://raw.githubusercontent.com/clash-verge-rev/clash-verge-rev/dev/src-tauri/tauri.conf.json)

### Inferences
- Creating windows in Rust (not JSON) is the common pattern among polished apps, because it allows per-OS branching (`#[cfg(target_os)]`), runtime theme colours and work-area-aware sizing before the first show. For this app, do the same: an empty `app.windows`, and build the reader window in `setup`.

### Gaps
- Cap, Spacedrive, Pake and Clash Verge Rev were not studied in depth. Their window-creation code (titlebar approach, vibrancy use, tray and always-on-top handling) wasn't read because of the tool-call budget and path uncertainty. Spacedrive has also moved away from Tauri in parts of its history, so verify which version is Tauri-based before citing it.
- No engineering blog posts from these teams on native polish were retrieved.
