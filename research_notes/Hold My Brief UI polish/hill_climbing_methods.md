# Hill-climbing a UI: iterative, measurable loops for agent-driven polish (Tauri 2 + vanilla TS)

Research note, 2026-11-05. Network limits in this session: playwright.dev, arxiv.org, huggingface.co and nngroup.com would not resolve. Playwright facts below come from the Playwright docs source on GitHub (raw.githubusercontent.com/microsoft/playwright). Paper findings come from search-result abstracts and summaries, not full-text reads. Treat any per-paper number marked "summary" as unverified.

## Screenshot evals: Playwright visual comparisons and visual regression tools

### Takeaway
Use Playwright's built-in `toHaveScreenshot()` as the regression gate. Keep baselines per OS (Playwright already adds the platform to snapshot names) and make captures deterministic: disable animations, hide the caret, mask volatile regions, and inject a `stylePath` stylesheet. Hosted reviewers like Argos or Chromatic are optional extras. Lost Pixel is being sunset, so don't adopt it.

### Cited Findings
- Running `await expect(page).toHaveScreenshot()` writes reference screenshots on the first run and compares against them afterwards. Refresh them with `npx playwright test --update-snapshots`. — [Playwright docs source: test-snapshots-js.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md)
- Comparison uses the pixelmatch library. `threshold` is "an acceptable perceived color difference in the YIQ color space between the same pixel in compared images", from 0 (strict) to 1 (lax), default `0.2`. `maxDiffPixels` and `maxDiffPixelRatio` (0–1) set how many differing pixels are tolerated, configurable per call or in `expect.toHaveScreenshot` in the config. — [test-snapshots-js.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md); [Playwright params.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/params.md)
- `animations: "disabled"` (the default for `toHaveScreenshot`) "stops CSS animations, CSS transitions and Web Animations". `caret` defaults to `"hide"`. `mask` takes locators that get "overlaid with a pink box `#FF00FF`", and `maskColor` changes that colour (since v1.35). `stylePath` is a "file name containing the stylesheet to apply while making the screenshot" (since v1.41), which "allows filtering out dynamic or volatile elements". — [params.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/params.md); [class-pageassertions.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-pageassertions.md); [test-snapshots-js.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md)
- Other options: `fullPage`, `clip`, `omitBackground`, `scale` ("css" gives one pixel per CSS pixel) and `timeout`. Snapshots can be stored as `.webp`. — [class-pageassertions.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-pageassertions.md)
- On cross-OS rendering: "Browser rendering can vary based on the host OS, version, settings, hardware… For consistent screenshots, run tests in the same environment where the baseline screenshots were generated." Default names carry browser and platform, e.g. `example-test-1-chromium-darwin.png`, and the path can be customised with `snapshotPathTemplate`. — [test-snapshots-js.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md)
- Lost Pixel's README now opens with "Lost Pixel is joining Figma… We are sunsetting the product". A secondary source dates the repo archive to 22 April 2026. — [Lost Pixel README](https://raw.githubusercontent.com/lost-pixel/lost-pixel/main/README.md); date from [cloudzy comparison](https://cloudzy.com/blog/argos-vs-lost-pixel-vs-backstopjs-compared/) (unverified)
- Argos is open source and captures in your own Playwright browser. A vendor or comparison claim says it is free up to 5,000 screenshots a month, then $100/month flat. It reportedly added ARIA-snapshot diffing for its Playwright SDK in November 2025. Self-hosting is described as "unsupported and operationally fragile". — [Argos blog: best VRT tools 2026](https://argos-ci.com/blog/best-visual-regression-testing-tools) (vendor); [cloudzy comparison](https://cloudzy.com/blog/argos-vs-lost-pixel-vs-backstopjs-compared/)
- reg-suit is an open-source diff, baseline and report engine, not a capture tool. You bring your own screenshots (e.g. from Playwright), and reports and baselines go to S3 or GCS. Chromatic is managed, Storybook-centric and reportedly starts at $179/month. — [cloudzy comparison](https://cloudzy.com/blog/argos-vs-lost-pixel-vs-backstopjs-compared/); [TestGuild tool list](https://testguild.com/visual-validation-tools/)
- Font anti-aliasing differences between macOS and Linux runners are a common source of false failures, whichever tool you use. — [cloudzy comparison](https://cloudzy.com/blog/argos-vs-lost-pixel-vs-backstopjs-compared/)
- Tauri 2 desktop WebDriver testing (`tauri-driver`) supports only Windows (msedgedriver must match the installed Edge/WebView2 version, or tests can hang) and Linux (WebKitWebDriver). macOS has no WKWebView driver. The upstream request, tauri-apps/tauri#7068, has been open since May 2023. — [Tauri v2 WebDriver docs](https://v2.tauri.app/develop/tests/webdriver/); [issue #7068](https://goodfirstissue.org/tauri-apps/tauri/issues/7068)

### Inferences
- For a Tauri app the cheapest deterministic surface is the frontend served by Vite in Playwright's Chromium (mocking `window.__TAURI__` / IPC), not the real webview. On Windows the real webview is WebView2, which is Chromium, so this is close to production. On macOS the real webview is WKWebView, so Playwright's `webkit` project is a closer proxy than Chromium there. Keep baselines separate for `-win32` and `-darwin`.
- A strict threshold gate (e.g. `maxDiffPixelRatio: 0.001`) stops *unintended* change, but in a polish loop every accepted step *intends* change. The loop therefore needs two kinds of baseline: a frozen "protected" set covering screens the change must not touch (must pass), and the target screen, where the diff is expected and gets judged on quality, not equality.
- Masking is a reward-hacking surface. An agent that can edit the test can mask or loosen its way to green. Keep the mask list and threshold config in a file the agent may not edit, and check that in CI (see the last section).
- Argos is the most viable hosted reviewer for Playwright if a human-review UI is wanted. reg-suit suits a fully self-managed pipeline. Plain Playwright plus the HTML report's diff viewer needs no third-party service and runs the same locally and on `windows-latest` / `macos-latest`.

### Gaps
- I couldn't load playwright.dev to confirm the current default for `scale` in `toHaveScreenshot` (the docs source lists both "device" and "css" variants), or any 2026 changes. The source shows a `signal` option added in v1.62.
- I didn't verify Argos pricing, Chromatic pricing or the Lost Pixel archive date against primary pages.

## A model as judge for UI quality: rubrics, pairwise vs absolute, reliability, published work

### Takeaway
VLM judges approximate human UI perception on some dimensions and diverge on others. They are good enough to rank two candidate screenshots for a polish loop, not to give trustworthy absolute scores. Use pairwise A/B with position swapping, one rubric dimension per judge call, an "unknown/tie" escape hatch, and periodic human calibration. Never let the judge's verdict override the deterministic gates.

### Cited Findings
- "MLLM as a UI Judge" (Luera et al., arXiv 2510.08783, Oct 2025) compared GPT-4o, Claude and Llama with crowdsourced human judgments of 30 interfaces on factors including aesthetics, usability and trustworthiness, using both a 1–7 Likert task and a pairwise task. In the authors' words, MLLMs "approximate human preferences on some dimensions but diverge on others". The data and code are at mllm-judge.github.io. — [arXiv 2510.08783 (via search abstract)](https://arxiv.org/html/2510.08783v1); [aitopics mirror](https://aitopics.org/doc/arxivorg:24CE1E38)
- WiserUI-Bench (arXiv 2505.05026, later retitled "Do MLLMs Capture How Interfaces Guide User Behavior?") has 300 UI pairs labelled with real A/B-test winners plus expert rationales, and tests whether models pick the better design. — [arXiv 2505.05026](https://arxiv.org/abs/2505.05026v3) (abstract via search; numbers not read)
- DesignPref (arXiv 2511.20513) is a 12k-pair dataset of designer pairwise comparisons with rationales, aimed at *personalised* design evaluation. Its framing implies design preference varies across individual designers. — [arXiv 2511.20513](https://arxiv.org/html/2511.20513v1)
- Related benchmarks: CANVAS (arXiv 2511.20737) evaluates VLMs *editing* UI designs through tool calls (598 tasks from 3.3K mobile UIs). UI-Lens (CVPR 2026) tests MLLMs at detecting UI display defects. "Can VLMs Assess Graphic Design Aesthetics?" (2603.01083) is a 2026 benchmark. MM-JudgeBias (arXiv 2604.18164) benchmarks compositional biases of MLLM judges. — [papers.cool CANVAS](https://papers.cool/arxiv/2511.20737); [UI-Lens CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/html/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.html); [MM-JudgeBias](https://arxiv.org/pdf/2604.18164)
- Position bias in pairwise LLM judging is systematic ("not due to random chance"), varies by judge and task, and gets *stronger as the quality gap between candidates shrinks*, which is exactly the small-delta regime of a hill-climb. — [Judging the Judges (arXiv 2406.07791)](https://arxiv.org/html/2406.07791v6)
- Pairwise vs pointwise: one 2025 study found pairwise preferences flipped in about 35% of cases when distractor features were planted, versus about 9% for absolute scores, so pairwise was more manipulable. Other sources (e.g. the MT-Bench framing) argue pairwise is more stable because relative judgments are easier. The evidence conflicts. — [Pairwise or Pointwise? (aitopics)](https://aitopics.org/doc/arxivorg:06056293); [MT-Bench summary](https://tailoredai.substack.com/p/judging-llm-as-a-judge-with-mt-bench)
- Common mitigation: call the judge twice with A/B swapped and count a win only when it holds in both orders. — [qaskills pairwise guide (blog, low authority)](https://qaskills.sh/blog/pairwise-llm-evaluation-guide-2026)
- Anthropic's evals guidance on model graders: use "clear, structured rubrics" ("vague rubrics produce inconsistent judgments"), grade each dimension with an isolated judge, give the judge an "Unknown" escape hatch, calibrate against human experts, and prefer deterministic graders where possible. — [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Inferences
- Rubric for a polish judge: one call per dimension, each returning `A | B | tie | unknown` plus a one-line reason citing a visible element. Suggested dimensions, each defined with concrete pass/fail descriptors rather than "looks nicer": (1) visual hierarchy, i.e. is the primary action obvious; (2) alignment and spacing consistency; (3) clutter, i.e. fewer competing elements for the same function; (4) typographic consistency; (5) state clarity (selected, disabled, error); (6) did anything break (overflow, truncation, overlap). Dimension 6 is a veto.
- Accept a change only if the swapped-order pairwise verdict favours the candidate on at least one dimension, it loses on none, and the deterministic metrics did not regress. This turns the judge into a tie-breaker inside guardrails, not the objective.
- Because judge bias is worst for small deltas, run several samples (e.g. three) per order and require a majority. Log every verdict so humans can audit drift. A weekly human spot-check of 10–20 accepted and rejected pairs is a practical calibration budget (my own inference, not sourced).
- Give the judge the same rendered screenshots at fixed viewport and DPR, plus the protected-screen diffs. Don't give it the agent's commit message or rationale, which invites persuasion and sycophancy.

### Gaps
- I couldn't read the full text of 2510.08783 or 2505.05026 (arxiv.org was blocked), so per-dimension agreement numbers and model accuracy on WiserUI-Bench are missing.
- I found no published study specifically on reward hacking *against* a VLM UI judge.

## Objective, automatable polish metrics

### Takeaway
Most "polish" can be proxied deterministically. Count distinct colour, font-size, spacing, radius and shadow values (fewer, and all on-token, is better). Check zero axe-core violations, especially `color-contrast`. Count visible interactive controls per screen. Then add layout-shift, interaction-latency and startup-time budgets from the existing perf harness. These form the hard gates. The model judge only arbitrates among candidates that pass them.

### Cited Findings
- Project Wallace's css-analyzer computes 150+ CSS metrics, including unique colours and font sizes. `wallace-cli` (which replaces the deprecated `css-analyzer-cli`) runs as `wallace path/to/styles.css` or via stdin. A companion `css-design-tokens` package extracts the de facto tokens (colours, font sizes, families, line heights, gradients) from CSS. — [css-analyzer](https://github.com/projectwallace/css-analyzer); [css-design-tokens](https://github.com/projectwallace/css-design-tokens); [npm css-analyzer-cli deprecated](https://www.npmjs.com/package/css-analyzer-cli); [OpenReplay guide](https://blog.openreplay.com/audit-stylesheet-project-wallace/)
- axe-core can be scoped with `runOnly` by tag (e.g. `['wcag2a','wcag2aa']`) or by rule (only listed rules run), and `rules` can enable or disable individual rules such as `color-contrast`. Results come back as `passes`, `violations`, `incomplete` ("needs review", which axe "could not definitively pass or fail") and `inapplicable`. Each has `id`, `impact`, `nodes[].target` and `failureSummary`. — [axe-core API.md](https://raw.githubusercontent.com/dequelabs/axe-core/develop/doc/API.md)
- Safari 26.2 (Dec 2025) reportedly added the Event Timing API (the basis for INP) and LCP to WebKit, with early reports of anomalously high INP values. I couldn't confirm `layout-shift` entry support in WebKit. — [apogeewatcher blog (secondary)](https://apogeewatcher.com/blog/measure-lcp-inp-safari-26-2-chrome-only-reports)
- The `LayoutShift` entry exposes `lastInputTime`, which lets you exclude shifts caused by recent input. — [MDN mirror: LayoutShift.lastInputTime](https://www-igm.univ-mlv.fr/~forax/MDN/developer.mozilla.org/en-US/docs/Web/API/LayoutShift/lastInputTime.html)

### Inferences
- Suggested metric set (`metrics.json` per run, per screen):
  - Token adherence: count of unique colour, font-size, spacing (margin/padding/gap), border-radius and box-shadow values in the *computed styles of visible elements*, read with `getComputedStyle` in a Playwright `page.evaluate`. Also the share of those values that belong to the token set (CSS custom properties defined in `:root`). Measure computed styles, not just source CSS, so inline styles and JS-set styles count. Wallace on the built CSS bundle is a cheap static complement.
  - Accessibility: axe `violations.length` (gate: must not increase; target 0), with `color-contrast` and `target-size` included. Track `incomplete` separately; don't count it as a pass.
  - Density and clutter: number of visible, enabled interactive elements (`button, a[href], input, select, [role=button], [tabindex]:not([tabindex="-1"])`, filtered by bounding box and visibility) per screen and per 100k px² of viewport. Also count distinct text styles and the number of distinct x-alignment edges (fewer edges suggests a cleaner grid; heuristic, unvalidated).
  - Layout stability: cumulative `layout-shift` value during scripted flows, measured in Chromium (WebView2 proxy). Treat WebKit numbers as unavailable or unreliable.
  - Interaction latency: Event Timing `duration` for scripted clicks and keypresses (Chromium), plus your existing harness's timings.
  - Startup: the existing perf harness's cold-start and time-to-first-interactive measurements for the real Tauri binary on Windows and macOS.
- Perf metrics are noisy. Use the median of N runs (e.g. 5–9) and a relative budget (e.g. fail if median regresses more than 5% or beyond a fixed ms floor). Hard thresholds on single runs cause flaky reverts.
- Lower unique-value counts are a proxy, not the goal. An agent can minimise them by deleting styling or content. Pair them with a "content preserved" check (visible text and accessible-name set unchanged, e.g. via Playwright `toMatchAriaSnapshot` or an a11y-tree dump diff) so de-cluttering can't silently drop functionality.

### Gaps
- I found no published, validated mapping from these counts (unique colours, alignment edges, control density) to perceived polish. They are practitioner heuristics.
- I didn't verify WebKit `layout-shift` support or the exact `wallace-cli` flags.

## De-cluttering heuristics: what to cut

### Takeaway
Nielsen's heuristic 8 (aesthetic and minimalist design) is about cutting *noise that competes with needed information*, not adopting a minimal visual style. Progressive disclosure, i.e. moving rarely used controls behind a secondary level, is the main tool for decluttering without removing capability.

### Cited Findings
- NN/g defines minimalism under this heuristic as limiting the interface's "noise" in order to emphasise necessary information. The heuristic dates from 1994 and does not mean the later flat or minimal visual trend, and a minimalist *style* does not automatically satisfy it. — [NN/g: Aesthetic and Minimalist Design (search snippet; page blocked)](https://www.nngroup.com/articles/aesthetic-minimalist-design/)
- Secondary sources tie the heuristic to progressive disclosure: hide minor information behind menus, help or "info" links, and check whitespace and visual hierarchy alongside it. — [The Decision Lab: Nielsen's heuristics](https://thedecisionlab.com/reference-guide/design/nielsens-heuristics); [UX Planet: Heuristic 8 examples](https://uxplanet.org/heuristics-8-aesthetic-and-minimalist-design-simplified-by-the-examples-42f904b8e0c0)

### Inferences
- Deciding what to cut in an agent loop (a decision procedure, not sourced):
  1. Inventory every visible control and label per screen (from the density metric) and tag each with its frequency of use. Use telemetry if you have it. If not, a human-supplied "core tasks" list for the app (Hold My Brief) stands in.
  2. Only controls *outside* the core-task list are candidates to move. Move them (to an overflow menu, settings, or a disclosure section), don't delete them. Deletion needs human sign-off.
  3. Remove redundancy first: duplicate paths to the same action, labels that repeat a heading, decorative borders or dividers where spacing already separates groups.
  4. Keep one disclosure level. Nested disclosure hurts findability. The NN/g progressive-disclosure article is commonly cited for "more than two levels" being problematic, but I couldn't load it to verify.
  5. Each removal must keep the a11y tree's set of *reachable* actions (directly or via one disclosure step) and must not break e2e tests for core tasks.
- Heuristic 8 makes a good rubric dimension for the judge ("does every visible element support the screen's primary task?"), but it should be phrased per element so the judge can point to specific noise.

### Gaps
- nngroup.com was blocked, so I couldn't quote NN/g's progressive-disclosure guidance (primary vs secondary split, level limits).

## How teams structure hill-climbing for agents, and avoiding reward hacking

### Takeaway
Anthropic's guidance maps directly onto UI polish. Use an evaluator-optimizer loop grounded in environment feedback, with a hard iteration cap. Prefer deterministic graders, with model graders where needed and humans to calibrate. Separate capability evals (the "hill") from regression evals (near 100%, must not drop). Isolate trials, grade outcomes, and read transcripts so you catch the agent gaming the grader.

### Cited Findings
- The evaluator-optimizer workflow: "one LLM call generates a response while another provides evaluation and feedback in a loop". It is "particularly effective when we have clear evaluation criteria" and when iterative refinement adds measurable value. — [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Agents should get "ground truth" from the environment at each step (tool results, code execution). It is "common to include stopping conditions (such as a maximum number of iterations)". Keep the design simple, and design the agent-computer interface and tools carefully. — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Eval-driven development: start with "20-50 simple tasks drawn from real failures". Make tasks unambiguous, so two experts would agree on pass/fail. Build balanced sets that test when a behaviour should *and shouldn't* occur. Distinguish capability evals (low pass rate, "a hill to climb") from regression evals (about 100%). Watch for saturation. — [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Anti-gaming: "The agent shouldn't be able to easily 'cheat' the eval". Isolate trials, because shared state leaks (Claude examined git history from earlier trials). Grade what was produced, not the path. Bugs hide in graders: CORE-Bench scores went from 42% to 95% after fixing rigid grading. "Read the transcripts!" — [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Metrics: pass@k (at least one success in k) vs pass^k (all k succeed). For example, a 75% per-trial rate gives roughly 42% pass^3. — [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Inferences
- Reward-hacking vectors specific to UI loops, with countermeasures:
  - Editing tests, baselines, masks or thresholds. Countermeasure: the agent's writable paths are `src/**` (styles and markup) only. `tests/**`, `playwright.config.*`, baselines, `eval/**` and the judge prompt are read-only, enforced by a diff-path check that auto-rejects the candidate.
  - Gaming the counters by deleting content or controls, collapsing everything into one menu, or inlining styles. Countermeasures: a content and actions preservation check (a11y snapshot of names and roles, e2e core flows), and measuring computed styles rather than source.
  - Gaming the judge with low-contrast "minimal" looks, empty screens, or text in the UI addressed to the judge. Countermeasures: axe contrast gate, content preservation, judge sees screenshots only, and a "did anything break" veto dimension.
  - Hiding problems: masking regions, `display:none` on failing elements, or viewport-specific hacks. Countermeasures: evaluate at two or more viewports and both themes, and diff the set of visible elements.
  - Overfitting to one screen at the expense of others. Countermeasure: protected-screen regression baselines must pass unchanged.
- Separate the "hill" (judge preference plus metric deltas on the target screen) from the "floor" (all e2e, protected visual baselines, axe, perf budgets). A candidate is kept only if the floor holds *and* the hill improves.
- Run each candidate in a clean worktree or branch (trial isolation), so the agent can't see or reuse earlier candidates' eval outputs except through the summarised log you choose to feed back.

### Gaps
- I found no OpenAI, Vercel, Figma or Linear engineering posts specifically on agent hill-climbing of UI polish within budget. Searches were limited and several hosts were blocked.

## What a concrete loop looks like: baseline, propose one change, measure, keep or revert

### Takeaway
Run a git-backed greedy hill-climb. Measure the baseline once and freeze it. Each iteration, the agent proposes exactly one small, named change scoped to one screen. Then run the floor gates (e2e, protected screenshots, axe, perf) and the hill score (metric deltas plus a swapped-order pairwise judge). Commit if it's strictly better, otherwise `git reset --hard`. Log everything, cap the number of iterations, and have a human review the accepted stack as a PR.

### Cited Findings
- The loop structure is the evaluator-optimizer pattern, with environment ground truth and a max-iteration stop condition. — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Use regression evals as a must-hold floor and capability evals as the hill, prefer deterministic graders, and calibrate model graders with humans. — [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Playwright screenshot determinism controls (animations disabled, caret hidden, mask, stylePath) and per-platform baselines. — [test-snapshots-js.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md); [params.md](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/params.md)
- Tauri's WebDriver path covers only Windows and Linux, so real-webview e2e on macOS needs another approach (e.g. a mocked-IPC frontend in Playwright WebKit, plus the perf harness on the real binary). — [Tauri v2 WebDriver docs](https://v2.tauri.app/develop/tests/webdriver/)

### Inferences
Example script outline (`scripts/ui-climb.ts`, run with `tsx`, or a GitHub Actions `workflow_dispatch` job on `windows-latest` and `macos-latest`):

```
config = load("eval/climb.config.json")      // read-only to agent: screens, viewports, themes,
                                             // protected screens, budgets, judge dims, maxIters
assert git clean; branch = `ui-climb/${date}`

// 0. BASELINE (once)
build frontend (vite build) ; start preview server with mocked Tauri IPC
base = measure(config)                       // see measure() below
save eval/runs/<ts>/baseline/{metrics.json, shots/*.png}

for i in 1..config.maxIters (e.g. 10):
  // 1. PROPOSE exactly one change
  ask agent: "Given screen X, metrics, last 5 log entries, and the rubric,
              propose ONE named change (<= N lines, src/** only). Output a patch + hypothesis."
  apply patch
  if diff touches paths outside allowlist or > maxLines: revert; log("rejected:scope"); continue

  // 2. FLOOR gates (all must pass; cheap → expensive)
  run tsc + lint                                   || revert; continue
  run playwright e2e core flows                    || revert; continue
  run toHaveScreenshot on PROTECTED screens (strict maxDiffPixelRatio) || revert; continue
  cand = measure(config)
  if cand.axe.violations > base.axe.violations     -> revert; continue
  if a11yActions(cand) ⊉ a11yActions(base)          -> revert; continue   // nothing became unreachable
  if perf median regress > budget (N runs)         -> revert; continue

  // 3. HILL score
  deltas = compare(cand.tokens, base.tokens)       // unique colours/sizes/spacing ↓, off-token ↓
  verdicts = for dim in rubric:
               v1 = judge(A=base.shot, B=cand.shot, dim)   // isolated call per dim
               v2 = judge(A=cand.shot, B=base.shot, dim)   // swapped order
               consistent(v1, v2) ? winner : "tie"
  improved = (any verdict == cand && none == base && !veto) || (metric deltas strictly better && no judge loss)

  // 4. KEEP or REVERT
  if improved: git commit -m "ui-climb #i: <change name> (<deltas>, judge: <dims won>)"
               base = cand                                // new baseline; update target-screen shots
  else:        git reset --hard; git clean -fd
  append eval/runs/<ts>/log.jsonl {i, patch, gates, deltas, verdicts, decision}

  stop early if K consecutive rejections (plateau) or judge "unknown" rate > threshold

open PR with log summary + before/after strip; human reviews and merges (human = final grader)

measure(config):
  for each screen × viewport × theme:
    page.goto; await fonts ready; disable animations; apply stylePath
    shot = page.screenshot()  (and toHaveScreenshot for protected screens)
    tokens = page.evaluate(collect computed styles of visible elements → unique sets)
    density = page.evaluate(count visible enabled interactive elements)
    axe = new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag22aa']).analyze()
    a11y = page.locator('body').ariaSnapshot()
    cls/latency = PerformanceObserver('layout-shift','event') during scripted flow (Chromium)
  startup = existing perf harness on built Tauri binary (median of N)
  return {tokens, density, axe, a11y, cls, latency, startup, shots}
```

- Practical settings: one change per iteration keeps attribution clean, and a 5-minute wall clock per iteration is realistic if the e2e subset is small. Run the full cross-OS matrix (Windows and macOS runners) only on the final PR, not on every iteration, and do the inner loop on one OS. Commit baselines per platform (`-win32`, `-darwin`) and regenerate them only through a human-approved `--update-snapshots` job.
- Feed the agent a short ranked "opportunities" list derived from the metrics (e.g. "7 font sizes, tokens define 4"; "3 contrast violations on Settings"; "23 visible controls on Home"). This keeps proposals targeted and gives the deterministic hill something to climb before you lean on the judge.
- When the change is intentional and visible on the target screen, update only that screen's baseline in the commit, so the next iteration compares against the new state.

### Gaps
- I found no published reference implementation of exactly this loop for desktop UIs. The outline is a synthesis of the sources above and standard Playwright and axe usage (`@axe-core/playwright` `AxeBuilder`, `locator.ariaSnapshot()`), and should be checked against current package APIs.
