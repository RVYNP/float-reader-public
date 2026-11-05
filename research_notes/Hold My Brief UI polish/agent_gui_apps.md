# UI and interaction design of desktop apps for coding agents: T3 Code, "Tern", Claude Code Desktop

Scope note: T3 Code findings come from reading its source directly (shallow clone of `pingdotgg/t3code` at commit `67eebaca`, HEAD dated 2026-11-05). Line numbers are approximate to that commit. Claude Code Desktop findings come from Anthropic's official docs and announcement. For "Tern" I could read the READMEs and design docs of the open-source candidates. bitdoze.com (the only hands-on review of Stencil's Tern) was blocked by this session's network allowlist, so Stencil Tern details come only from search-result summaries of that review.

## Identity of "Tern" (UNCERTAIN)

### Takeaway
At least five unrelated projects are called "Tern" in 2026, and all of them sit close to coding agents. The most likely match for "a polished desktop app named alongside T3 Code" is **Stencil's Tern**: a closed-beta, Rust-native terminal/workspace from the team behind the `omp` agent CLI, with a visible plugin ecosystem. It is closed source, so its design can't be checked in detail. For Hold My Brief the most *useful* design reference is a different one: **codingwolf-at/tern**, a small native macOS menu-bar app with an explicit written design system ("Quiet by default"). It is close to a small always-on-top reader in form factor.

### Cited Findings
- Candidates found by search:
  - **Stencil Tern**: described by a hands-on review (2026-10-20) as "the new terminal from Stencil, the team behind the omp agent CLI". Rust-native, closed beta with a waitlist, builds for macOS, Windows, Linux and Android. It bundles an omp agent as a native "block" with model pickers, slash commands, skills and a context inspector. Other blocks: Git, SQLite, Jupyter, kanban board, file editor, task manager. Panes persist across restarts. — [Bitdoze review (via search summary; page not fetchable here)](https://www.bitdoze.com/tern-terminal/)
  - **ishaanrajiv/tern**: "A macOS terminal built around coding agents. The sidebar shows which agent needs you, the keys are Mac-native, and sessions survive quitting the app." Early alpha. — [GitHub](https://github.com/ishaanrajiv/tern)
  - **cuong95nddev/tern**: "A fast, native terminal for coding agents, on macOS, Windows and Linux… written in Rust and rendered on the GPU." — [GitHub](https://github.com/cuong95nddev/tern)
  - **alejoacelas/tern**: "a macOS terminal for working with coding agents, built on Ghostty (releases only)". — [GitHub](https://github.com/alejoacelas/tern)
  - **codingwolf-at/tern**: "a small native macOS menu bar app that tracks the state of each piece of work and stays quiet until the next action comes back to you". It tracks GitHub, Plane, Claude Code sessions (via hooks) and Calendar. — [GitHub](https://github.com/codingwolf-at/tern)
  - (Not a desktop app) axsh/arctic-tern: a Go framework for running coding agents through a common interop layer. — [pkg.go.dev](https://pkg.go.dev/github.com/axsh/arctic-tern@v0.1.10)
- Evidence that Stencil Tern is the "notable product": GitHub search shows third-party plugins and tools built against it, e.g. "Live terminal map of coding agents and orchestration traffic in Stencil Tern" (LadderChaos/ternwatch), "Tern integration for the pi coding agent: TSP handshake…" (Ghost-9/pi-tern), "A task manager built for Tern and omp" (deLiseLINO/tern-todo), "Agent skill for building native Tern terminal UI" (frapetti-dev/tern-ui). — [GitHub search results, e.g. tern-todo](https://github.com/deLiseLINO/tern-todo); [ternwatch](https://github.com/LadderChaos/ternwatch)
- omp itself is open source (MIT) at can1357/oh-my-pi. — [braindetox.kr explainer](https://braindetox.kr/en/posts/omp_terminal_ai_coding_agent_2026.html)

### Inferences
- Best match: **Stencil Tern** (medium confidence). Its ecosystem and the reviewer coverage set it apart from the hobby repos (1–3 stars each). The user should confirm.
- Because Stencil Tern is closed and its review page was unreachable, this doc uses **codingwolf-at/tern** and **ishaanrajiv/tern** as the concrete "Tern" design evidence. codingwolf-at/tern's BRAND.md is the single most transferable source in this research for a small always-on-top reader.

### Gaps
- No official Stencil website, launch post or designer statement found. Screenshots, typography and colours of Stencil Tern are unverified. To check, allow `www.bitdoze.com` in network settings or ask the user for the Stencil URL.

## Chrome density: title bar, drag regions, toolbars, what is visible vs hidden

### Takeaway
All three hide the native title bar and put content up to the window edge. T3 Code uses macOS `hiddenInset` with repositioned traffic lights and a 52px top bar that doubles as the drag region. Claude Code Desktop puts the session title, pane toggle buttons and a single ⋮ overflow menu in one title bar, and moves anything that doesn't fit into that menu. The Tern apps hide everything except what "needs you".

### Cited Findings
- **T3 Code (Electron)**, `apps/desktop/src/window/DesktopWindow.ts` ~L42–67, L245–266: on macOS `titleBarStyle: "hiddenInset"` with `trafficLightPosition: { x: 16, y: MACOS_WORKSPACE_TOPBAR_HEIGHT / 2 - MACOS_WINDOW_BUTTON_RADIUS }`, where `MACOS_WORKSPACE_TOPBAR_HEIGHT = 52` and `MACOS_WINDOW_BUTTON_RADIUS = 7`, so the traffic lights sit vertically centred in the 52px top bar. Windows/Linux use `titleBarStyle: "hidden"` plus `titleBarOverlay` with `TITLEBAR_HEIGHT = 40` and a transparent colour `TITLEBAR_COLOR = "#01000000"` (comment: "#00000000 does not work correctly on Linux"), with symbol colour switched for dark/light. — [DesktopWindow.ts](https://github.com/pingdotgg/t3code/blob/main/apps/desktop/src/window/DesktopWindow.ts)
- T3 Code CSS defines `--workspace-topbar-height: 52px`, `--workspace-titlebar-control-size: 1.75rem` (28px), `--workspace-titlebar-control-gap: 0.75rem`, `--workspace-titlebar-scroll-fade-height: 1.5rem`. A `.wco` class (Window Controls Overlay) reads `env(titlebar-area-x/y/width/height)` so controls avoid native buttons: `--workspace-topbar-height: max(40px, env(titlebar-area-height, 52px))`. — [apps/web/src/index.css ~L100–160](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- T3 Code drag region (index.css ~L1828–1848): `.drag-region { -webkit-app-region: drag; }` with children reset to `initial` ("Electron 44 inherits app-region") and `button, input, textarea, select, a` set to `no-drag`. — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- T3 Code empty/no-thread header shows only one muted label in Electron: `<span className="text-xs text-muted-foreground/50">No active thread</span>`. — [NoActiveThreadState.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/NoActiveThreadState.tsx)
- T3 Code also adds a 6px right resize inset on Windows Electron (`.electron-windows { --desktop-window-right-resize-inset: 6px; }`). — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- **Claude Code Desktop**: the session title bar holds the session title (click to rename), pane buttons (Terminal, Changes, Browser, Files), a ⋮ menu, and Hide/Show session rail. "Hover to see each button's name". "When the window is narrow, buttons that don't fit move into the menu." Panes with no button (Background tasks, Plan) "appear in the ⋮ menu once the session has content for them." The session rail "appears after you start a session, while the chat is wide enough for it." — [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- Claude Code Desktop: in split view "the pane you opened or clicked last has focus, and the other pane is dimmed." Panes can be popped out into their own window or minimized into a corner. — [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- Claude Code Desktop sidebar: sessions "archive automatically when their PR merges or closes", which keeps the sidebar on live work. — [Anthropic: Redesigning Claude Code on desktop](https://claude.com/resources/articles/claude-code-desktop-redesign)
- **ishaanrajiv/tern**: each pane header "shows what runs there and where, with split and close buttons; panes other than the focused one are dimmed." Tabs name themselves after what they run; "one with nothing to go by is a dimmed 'Shell'". Toggle sidebar ⌃⌘S / ⌘\. — [README](https://github.com/ishaanrajiv/tern)
- **codingwolf-at/tern**: the chrome is a menu-bar glyph. "Idle (nothing needs you): path only, no ball". "Your turn: path and ball… with the count as text after it". "No colour and no red badge in the menu bar. The ball landing *is* the signal." Panel sections: Needs you, Waiting, Active, Your other work, Done today, Idle. — [BRAND.md](https://github.com/codingwolf-at/tern/blob/main/docs/BRAND.md); [README](https://github.com/codingwolf-at/tern)

### Inferences
- For a Tauri 2 reader: use `decorations: false` or the macOS `titleBarStyle: "Overlay"` + `hiddenTitle`. Make one thin top strip (about 28–40px for a small window) the drag region via `data-tauri-drag-region`, mark buttons as non-drag, and centre the traffic lights in that strip the way T3 Code does.
- Copy Claude's overflow rule: show at most two or three icon buttons and push the rest into a single ⋮ menu. Reveal labels on hover (tooltip) instead of showing text labels.
- Dim unfocused or inactive content rather than adding borders (Claude split view, ishaanrajiv/tern panes).

### Gaps
- Stencil Tern's title bar treatment is unknown.
- I did not verify how many toolbars T3 Code shows by default from screenshots. The counts above come from CSS and components only.

## Typography, spacing and colour

### Takeaway
T3 Code uses a system font stack (SF/`-apple-system` first, Inter Variable as fallback) with a dense size scale extended below 12px (11/10px). Colours are neutral zinc greys with a single blue `primary` in OKLCH, and dark mode uses pure black with white-alpha borders. codingwolf-at/tern codifies the same restraint more strictly: system fonts only, at most three sizes per view, hierarchy through weight and colour, one accent.

### Cited Findings
- **T3 Code font tokens** (index.css `@theme`, ~L165): `--font-sans: -apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", system-ui, sans-serif;` `--font-mono: ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;` They are declared outside the inline theme "so utilities reference the variables and Settings -> Appearance can override them at runtime." — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- **T3 Code sub-12px scale**: "Two steps below Tailwind's text-xs (12px) for dense UI: metadata rows, badges, counters, keyboard hints and diagnostics tables. 2xs is 11px, 3xs is 10px." `--text-2xs: 0.6875rem; --text-3xs: 0.625rem;` (plus 8px and 7px for icon badges). — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- T3 Code user-adjustable sizes: "Interface size sets the root; prompt and code use pixels to avoid double scaling." It sets `root.style.fontSize`, `--font-size-prompt`, `--font-size-code`, `--diffs-font-size`. — [appearanceFonts.ts](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/appearanceFonts.ts)
- T3 Code "Compact UI geometry. Keep these values semantic so sidebar, palette, tooltip, and toolbar controls cannot quietly drift apart": `--control-radius: 0.5rem; --sidebar-content-inset: 0.5rem; --sidebar-control-gap: 0.5rem; --sidebar-row-content-inset: 0.625rem; --command-shell-inset: 0.5rem; --command-content-inset: 1rem; --floating-content-inset: 0.75rem;` `--chat-content-max-width: 46rem; --thread-details-panel-width: 17.5rem; --workspace-gutter: 0.75rem` (1.25rem at `sm`). `--radius: 0.5rem`. Sidebar width `SIDEBAR_WIDTH = "16rem"`. — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css); [ui/sidebar.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/ui/sidebar.tsx)
- **T3 Code light palette** (~L1113–1171): `--background: zinc-25` (custom `oklch(99.2% 0 0)`), `--foreground: zinc-900`, `--card/--popover: white`, `--primary: oklch(0.488 0.217 264)` (blue), `--secondary/--muted: zinc-50`, `--muted-foreground: zinc-500`, `--accent: zinc-100`, `--border: zinc-200`, `--input: zinc-300`, `--ring: var(--primary)`, `--sidebar: zinc-50`. Sidebar comment: "quiet zinc hierarchy: zinc-50 navigation, zinc-25 hover, and white selected/raised surfaces." — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- **T3 Code dark palette** (~L1192–1220): `--background: #000`, `--foreground: neutral-100`, `--card/--popover: color-mix(in srgb, neutral-950 97%, white)`, `--primary: oklch(0.571 0.21 264)`, `--secondary/--muted: white/3%`, `--accent: white/4%`, `--border: white/8%`, `--input: white/11%`, `--muted-foreground: neutral-400`. A second preset (~L1256) uses `--foreground: #f1f3f7; --accent: #191a1d; --muted: #0a0a0a; --muted-foreground: #a3a3a3; --border: rgb(255 255 255 / 8%)`. Dark scrollbar thumb `rgb(255 255 255 / 8%)`, hover 12%; scrollbar width 6px. — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- T3 Code polish details: lighter icon strokes, "CSS beats lucide's stroke-width="2" attribute" → `stroke-width: 1.75`. A subtle SVG fractal-noise "grain" at 0.035 opacity is baked into surface backgrounds, not added as an overlay, because "a full-viewport overlay forces the compositor to re-blend every frame". Glass tokens `--glass-blur: 12px` (16px dark), `--glass-opacity: 80%`. Composer shadow `0 1px 2px rgb(0 0 0 / 5%)` light / `0 14px 32px -18px rgb(0 0 0 / 75%)` dark. Inset highlight `0 1px rgb(255 255 255 / 16%)`. Semantic colours (warning, error, success, info, diff) are separate tokens. — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- **codingwolf-at/tern typography**: "Use system fonts only. No downloaded fonts." Panel title SF Pro 15pt Semibold; row title 13pt Semibold; row metadata 12pt Regular ink2; section label 11pt Semibold, sentence case; identifiers SF Mono 11.5pt; counts use monospaced digits. "Sizing philosophy: native macOS sizes (13 pt body), hierarchy through weight and colour and not through size jumps, and at most three sizes per view." — [BRAND.md](https://github.com/codingwolf-at/tern/blob/main/docs/BRAND.md)
- **codingwolf-at/tern colour**: ink `#17191C`/`#EDEBE6`, ink2 `#686C73`/`#9A9DA3`, ink3 `#9A9DA3`/`#6B6F76`, single accent coral `#E5533B`/`#FF6A4D`, critical `#C42452` "deliberately pushed toward crimson… away from Coral". Rules: "At most one filled Coral element per row, and one Coral-filled button per screen", "Semantic colours tint text or a small glyph. They never fill a row background.", "No gradients, no purple, no blue primary." The system `AccentColor` is left at default because "A global coral accent would leak into links, toggles and focus rings". The panel "keeps the system materials and vibrancy". — [BRAND.md](https://github.com/codingwolf-at/tern/blob/main/docs/BRAND.md)
- ishaanrajiv/tern's default terminal font in its example config: `font-family = JetBrains Mono`, `font-size = 14`. — [README](https://github.com/ishaanrajiv/tern)

### Inferences
- A concrete starter token set for Hold My Brief, copied from these sources: system stack `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`; body 13px; labels 11px semibold; metadata 12px; at most three sizes per view; 8px radius; 8px insets; zinc greys; one accent used only for the single primary action or state; dark mode `#000` or near-black with `rgba(255,255,255,.08)` borders; lucide-style icons at 1.75 stroke.
- Mono only for identifiers and code. Use `font-variant-numeric: tabular-nums` for counts and times.

### Gaps
- No public colour or font data for Claude Code Desktop or Stencil Tern. Claude Desktop's appearance settings weren't covered in the parts of the docs I read.

## Motion, feedback, loading, empty states, onboarding

### Takeaway
Motion in all three is short, decelerating and functional. T3 Code even steps its skeleton and status pulses to save GPU work, and every app honours reduced motion. Empty states are one-line, plain statements. Onboarding is minimal: Claude Desktop is "sign in, click Code, type and press Enter", and first-use prompts appear only when a capability is first used.

### Cited Findings
- T3 Code motion tokens: `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` ("the decelerating curve for surfaces that slide or pop in"). Mobile composer view transitions use `cubic-bezier(0.4, 0, 0.2, 1)` with a 35–65% crossfade "so the layout change does not read as a single-frame cut", and a headline exit of `translateY(-6px)` + fade. — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- T3 Code loading: `--animate-skeleton: skeleton 2.4s infinite`. It is "The single loading-bar breath used by every skeleton… stepped so… the compositor draws a handful of discrete frames per cycle rather than one per vsync — which on a 120Hz display is the difference between ~14 and ~288 updates", with opacity 1 → 0.55 using `steps(4)`. Status indicators: "Duty-cycled indicator animations: long holds with stepped ramps" (`status-pulse 2s`, opacity 1 → 0.5, `steps(6)`). — [index.css ~L240–345](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- T3 Code has a `.no-transitions` kill switch (all durations 0s), panel animations gated by `data-panel-animations=true` with `ease-out` and a `--panel-animation-duration` variable, and multiple `prefers-reduced-motion: reduce` blocks. — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css); [ui/sidebar.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/ui/sidebar.tsx)
- T3 Code empty state: title "Pick a thread to continue", description "Select an existing thread or create a new one to get started." — [NoActiveThreadState.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/NoActiveThreadState.tsx)
- T3 Code onboarding is by README: install and authenticate a provider CLI first; there is no account requirement for the CLI flow ("Wait, what are you selling me?" "Nothing."). — [README](https://github.com/pingdotgg/t3code)
- Claude Code Desktop first run: "After installing, launch Claude, sign in, and click the **Code** tab." "Type your task and press **Enter** to start." First-use prompts are contextual: the first external link click asks Browser pane vs default browser; the first computer-use action asks "Allow for this session or Deny". It sends an OS notification "when a Code session finishes a task and you aren't currently viewing that session." Reconnect status rows are plain, e.g. "Loading recent output from <host>…". — [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- Claude Code Desktop streams responses "as Claude generates them" after being "rebuilt for reliability and speed". — [Anthropic redesign article](https://claude.com/resources/articles/claude-code-desktop-redesign)
- codingwolf-at/tern: "Purposeful motion. Animate only arrivals and departures… Keep it short (≤ 200 ms), with no loops, pulses or bounce." "Quiet by default. Silence is the normal state. Colour, motion and sound are spent only when the turn changes to you." Empty state: "Nothing needs you." with header summary "All quiet". Voice table: prefer "Nothing needs you." over "You're all caught up! 🎉 Great job!"; "No exclamation marks, no emoji". — [BRAND.md](https://github.com/codingwolf-at/tern/blob/main/docs/BRAND.md)
- ishaanrajiv/tern: "Transitions are short and become fades with Reduce Motion on." Notifications permission is asked once. — [README](https://github.com/ishaanrajiv/tern)

### Inferences
- For Hold My Brief: 150–200ms transitions with `cubic-bezier(0.32,0.72,0,1)` for anything that slides; fade-only under `prefers-reduced-motion`; no looping spinners (a stepped low-frequency opacity pulse on skeleton bars instead, which also matters for an always-on-top window that is always on screen); a one-sentence, emoji-free empty state; no onboarding tour. Ask for permissions contextually at first use.

### Gaps
- No public Claude Desktop motion specs.

## Command palette, keyboard-first design, settings, sidebars and drawers

### Takeaway
T3 Code has a full ⌘K command palette that is also used for theme switching and project and thread lookup. Claude Code Desktop has no palette in the docs; it relies on a dense shortcut map shown with ⌘/ and numbered menu selection. Tern (ishaanrajiv) has a ⌘⇧, "Quick Settings" overlay that changes values with arrow keys and previews live.

### Cited Findings
- T3 Code default binding: `{ key: "mod+k", command: "commandPalette.toggle", when: "!terminalFocus" }`. — [packages/shared/src/keybindings.ts ~L174](https://github.com/pingdotgg/t3code/blob/main/packages/shared/src/keybindings.ts)
- T3 Code palette components include `CommandPalette.tsx`, `CommandPaletteThemeItems.tsx`, `CommandPaletteThreadItems.tsx`, `CommandPaletteProjectItems.tsx`, `CommandPaletteAddProject.tsx`; settings are searchable (`components/settings/settingsSearch.ts`). Keybindings are user-configurable (`KeybindingsConfigWarning.tsx`, `KeybindingsUpdateToast.tsx`). — [apps/web/src/components](https://github.com/pingdotgg/t3code/tree/main/apps/web/src/components)
- Claude Code Desktop shortcuts (macOS): ⌘/ show shortcuts; ⌘N new session; ⌘W close; Ctrl+Tab switch sessions; Esc stop; ⌘⇧D diff pane; ⌘⇧B browser; Ctrl+` terminal; ⌘\ close focused pane; ⌘; side chat; Ctrl+O cycle view modes; ⌘⇧M permission mode menu; ⌘⇧I model menu; ⌘⇧E effort menu; "1–9 Select item in an open menu". — [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- Claude Code Desktop progressive disclosure: view modes Normal ("Tool calls collapsed into summaries, with full text responses"), Thinking, and Verbose. "The Thinking option appears only after Claude has produced thinking in that session." Settings live under Settings > Code, with toggles (prompt suggestions, bypass permissions, browser tools, worktree location, auto-archive). "Customize" in the sidebar holds connectors, skills and plugins. Organizing controls appear only on hover ("hover over a heading in the session list to show the Group and sort icon"). — [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- The redesign announcement lists the sidebar (filter by status, project or environment; group by project) and drag-and-drop panes as the core interaction changes. — [Anthropic redesign article](https://claude.com/resources/articles/claude-code-desktop-redesign)
- ishaanrajiv/tern: "⌘⇧, (tern → Quick Settings…) changes the theme, text size, cursor, notifications and more without leaving the keyboard: ←/→ change the selected value, and the theme list previews each theme as you move through it (Esc puts yours back)." ⌘J jumps to the next tab that needs you; the Dock badge counts waiting ones. The foot of the sidebar shows usage limits and one update card ("The most urgent row shows in full… the others follow as one line each"). — [README](https://github.com/ishaanrajiv/tern)
- cuong95nddev/tern: "Themes and settings in plain files: colors, fonts and sizes, applied as you save, easy for an agent to edit". — [README](https://github.com/cuong95nddev/tern)
- T3 Code sidebar actions are hover-revealed (`@custom-variant any-hover`: "Secondary hovering pointers reveal sidebar actions on touch-primary devices"). — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)

### Inferences
- For a small reader, a full palette may be overkill. A ⌘/ shortcut sheet plus a ⌘K palette with 5–10 actions (open brief, toggle pin/always-on-top, theme, opacity, settings) is the right size. A "Quick Settings" popover with live preview and Esc-to-revert is a strong, cheap pattern to copy.
- Hide row actions until hover; reveal options only once they apply (Claude's "Thinking" mode appears only when relevant).

### Gaps
- Didn't inspect T3 Code's palette styling (width, row height) in detail.

## What each deliberately leaves out; public statements on restraint and polish

### Takeaway
T3 Code positions itself as "a minimal GUI for coding agents" and writes "fight scope creep" into its contributor rules. Claude Desktop's restraint shows in auto-archiving, overflow menus and collapsed tool calls by default, but Anthropic has no explicit statement about visual restraint. codingwolf-at/tern has the most explicit written restraint principles found.

### Cited Findings
- T3 Code AGENTS.md: "T3 Code is a minimal GUI for coding agents." "Channel both 'measure twice, cut once' and 'yagni'. Fight scope creep." "UI changes need before/after images. Motion or timing needs a short video." User docs should not describe "visible buttons, icons, layouts, animations, or every UI state". "Orchestration stays pure, UI stays dumb." — [AGENTS.md](https://github.com/pingdotgg/t3code/blob/main/AGENTS.md)
- T3 Code README: "We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar. We wanted something performant, remote-ready, and truly open." — [README](https://github.com/pingdotgg/t3code)
- Theo reportedly built T3 Code out of frustration with Codex performance, worktree limits and model lock-in; co-built with Julius Marminge (aggregator summary of launch video; launch dates conflict between 2026-03-07 and 2026-04-16). — [rosetta.to Theo profile](https://rosetta.to/u/t3dotgg/topic/artificial-intelligence/2026)
- Claude Code Desktop announcement: "built for how agentic coding actually feels now". No explicit statement about visual restraint. — [Anthropic redesign article](https://claude.com/resources/articles/claude-code-desktop-redesign)
- codingwolf-at/tern visual principles: "Quiet by default", "State over activity", "One clear action", "Hierarchy over density. Fewer rows with clear weight beat more rows. Use whitespace and weight before borders and boxes.", "Coral is a signal, not a theme… If everything is coral, nothing is.", "Native first… Tern should look like it shipped with macOS and then got opinions." It is "not a notification aggregator". It leaves out action buttons for agent sessions ("answering Claude happens in its own terminal"). — [BRAND.md](https://github.com/codingwolf-at/tern/blob/main/docs/BRAND.md); [README](https://github.com/codingwolf-at/tern)

### Inferences
- The shared playbook: leave out persistent labels, borders and boxes, coloured backgrounds, badges, gradients, emoji and tours. Keep one accent and one primary action. Collapse detail by default and auto-hide finished items.

### Gaps
- No primary-source statement from Theo specifically about T3 Code's visual design. No Anthropic designer write-up on Claude Desktop polish.

## Tech stack where it affects feel

### Takeaway
T3 Code and Claude Code Desktop are both Electron (web UI). Their polish comes from CSS discipline and attention to performance, not from native widgets. All the Tern candidates are native: Swift/SwiftUI, or Rust with GPU or Ghostty rendering. Their pitch is "fast, native", and they lean on system materials.

### Cited Findings
- T3 Code desktop: `"electron": "44.10.1"`, electron-builder, Tailwind CSS v4; the web UI is shared across web, desktop and mobile; "Electron-based desktop app". — [apps/desktop/package.json](https://github.com/pingdotgg/t3code/blob/main/apps/desktop/package.json); [README](https://github.com/pingdotgg/t3code)
- T3 Code performance-motivated CSS: grain baked into surfaces to avoid compositor re-blending, and stepped animations to cut frame updates (see Motion). — [index.css](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css)
- Claude desktop is Electron. Commentary attributes the choice to the team's Electron background (Felix Rieseberg, an Electron co-maintainer, leads Claude Code Desktop per Gruber, July 2026; secondhand). An Anthropic job listing describes combining Electron with native Rust/Swift/C++ and optimizing memory and startup. — [dbreunig.com](https://dbreunig.com/2026/02/21/why-is-claude-an-electron-app.html); [webpronews](https://www.webpronews.com/why-anthropic-chose-electron-for-claudes-desktop-app-and-what-it-reveals-about-the-future-of-ai-interfaces/)
- Tern stacks: codingwolf-at (Swift/SwiftUI, Xcode project, menu bar), ishaanrajiv (Rust crates + daemon `ternd`, Ghostty config names), cuong95nddev (Rust, GPU-rendered), alejoacelas (built on Ghostty), Stencil (Rust-native per review). — [codingwolf-at](https://github.com/codingwolf-at/tern); [ishaanrajiv](https://github.com/ishaanrajiv/tern); [cuong95nddev](https://github.com/cuong95nddev/tern); [alejoacelas](https://github.com/alejoacelas/tern)

### Inferences
- Tauri 2 + vanilla TS sits between the two camps. Its web UI can borrow T3 Code's tokens directly, and native window effects (macOS vibrancy via `window-vibrancy`/Tauri `windowEffects`, transparent window, overlay title bar) can give the "native first" material feel the Tern apps get from SwiftUI.

### Gaps
- No measured performance comparisons between these apps.
