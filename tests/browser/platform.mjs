// Cross-platform resolution for the native/browser test harness.
//
// Everything Windows-specific that the suite used to hardcode lives here, so the
// assertions themselves stay platform-neutral and no single script has to know
// which OS it is on.
//
// Why this file exists (findings, not guesses):
//  - Playwright is pinned to a precise Chromium *revision* (1.64.1 asks for
//    chromium-1248). A machine can have a perfectly complete, runnable
//    chromium-1243 in the ms-playwright cache and still fail with
//    "Executable doesn't exist .../chromium-1248/...". Matching only the
//    revision that Playwright *names* therefore turns a usable install into a
//    spurious failure, so we scan the cache for any complete chromium build
//    instead and pass it as executablePath.
//  - Microsoft Edge is the Windows WebView2 runtime; it does not exist on macOS
//    or Linux. `channel: 'msedge'` is a Windows-only choice.
//  - Tauri on Windows renders in WebView2 (Chromium, supports CDP via
//    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS). On macOS it renders in WKWebView,
//    which has no CDP endpoint at all: remote inspection only happens through
//    Safari's "Develop" menu over the WebKit Web Inspector protocol, which
//    Playwright's chromium.connectOverCDP cannot speak. So the native smoke
//    test must degrade to process/window/lifecycle checks on macOS and keep the
//    full CDP assertions on Windows.

import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';

// `require` is used for node:child_process spawnSync below (sync calls where an
// async import would force the whole module to stay async-only).
const require = createRequire(import.meta.url);

export const isWindows = platform() === 'win32';
export const isMac = platform() === 'darwin';
export const isLinux = platform() === 'linux';
export const platformLabel = isWindows ? 'Windows' : isMac ? 'macOS' : isLinux ? 'Linux' : platform();

/** A skipped assertion must never look like a passing one. */
export function logSkip(what, why) {
  console.log(`SKIP (${platformLabel}): ${what}\n  reason: ${why}`);
}

// ---------------------------------------------------------------------------
// Native app binary
// ---------------------------------------------------------------------------

const EXE = isWindows ? '.exe' : '';
// The .app is "Float Reader.app" but CFBundleExecutable is the crate name,
// `float-reader` -- verified on the produced bundle. The legacy product-name
// binary is kept as a fallback for bundles made by other tooling.
const MAC_BUNDLE_BINARIES = [
  join('dist', 'Float Reader.app', 'Contents', 'MacOS', 'float-reader'),
  join('dist', 'Float Reader.app', 'Contents', 'MacOS', 'Float Reader'),
];

/**
 * Where the compiled desktop app lives per platform.
 *
 *   Windows  dist/Float Reader.exe                     (needs WebView2Loader.dll beside it)
 *   macOS    dist/Float Reader.app/Contents/MacOS/Float Reader   (cargo/tauri --bundles app)
 *   Linux    dist/float-reader                        (plain binary; no app-bundle convention)
 *
 * An explicit FLOAT_READER_BINARY overrides the guess on every platform, which is
 * how CI (or a `cargo build` that placed the binary under src-tauri/target)
 * points the smoke tests at the real artifact.
 */
export function nativeBinaryPath() {
  const override = process.env.FLOAT_READER_BINARY?.trim();
  if (override) return { path: resolve(override), source: 'FLOAT_READER_BINARY' };
  if (isMac) {
    const found = MAC_BUNDLE_BINARIES.map(candidate => resolve(candidate)).find(existsSync);
    return { path: found ?? resolve(MAC_BUNDLE_BINARIES[0]), source: 'default macOS app bundle' };
  }
  if (isLinux) return { path: resolve(`dist/float-reader`), source: 'default Linux binary' };
  return { path: resolve(`dist/Float Reader${EXE}`), source: 'default Windows executable' };
}

/**
 * Resolve the native binary or explain, actionably, why the run has to skip.
 * Returns `{ ok: true, path }` or `{ ok: false, reason }`. Never throws: callers
 * decide whether a missing binary is a skip (macOS/WIP) or a hard failure.
 */
export function requireNativeBinary() {
  const { path, source } = nativeBinaryPath();
  if (existsSync(path)) return { ok: true, path };
  const howToBuild = isMac
    ? 'npx tauri build --bundles app   # or: npm run package:macos'
    : isWindows
      ? 'npm run package   # or: src-tauri\\build-native.ps1'
      : 'cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol';
  return {
    ok: false,
    path,
    reason:
      `Native app not found at ${path} (expected from ${source}).\n` +
      `  Build it first: ${howToBuild}\n` +
      `  Or point at an existing binary with FLOAT_READER_BINARY=/path/to/binary`,
  };
}

/**
 * Executable name as the OS reports it.
 *
 * macOS: the crate/binary name is `float-reader` (CFBundleExecutable), NOT the
 *        product name "Float Reader" -- the .app is "Float Reader.app" but the
 *        binary inside Contents/MacOS is `float-reader`.
 * Windows: the executable is "Float Reader.exe".
 */
export function nativeProcessName(binaryPath = nativeBinaryPath().path) {
  if (isWindows) return `Float Reader${EXE}`;
  return basename(binaryPath);
}

/** True when `pid` is a live process we are allowed to signal (our own child). */
export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Detect an already-running instance of the app.
 *
 * This matters because the app uses tauri-plugin-single-instance: a second
 * launch forwards its argv to the first process and exits 0 almost instantly
 * (measured: 63 ms). Without this check, "app exited 0" is ambiguous between
 * "clean quit" and "another instance was already running", which makes any
 * liveness assertion lie. Returns the matching PIDs (may be empty).
 */
export function findRunningInstances(processName = nativeProcessName()) {
  const { spawnSync } = require('node:child_process');
  if (isWindows) {
    const result = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH'], { encoding: 'utf8' });
    return (result.stdout ?? '').split('\n').filter(line => line.includes(processName)).map(line => Number((line.trim().split(/\s+/)[1]))).filter(Number.isFinite);
  }
  // pgrep exits 1 with no output when nothing matches, which is not an error here.
  const result = spawnSync('pgrep', ['-x', processName.replace(/\.app$/, '')], { encoding: 'utf8' });
  if (result.error) return []; // pgrep unavailable (some minimal containers): treat as "none found".
  // Number('') is 0, so filter the empty fields BEFORE converting.
  return (result.stdout ?? '').split('\n').map(line => line.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
}

/**
 * Ask the OS how many windows the app currently shows. macOS only.
 *
 * Uses System Events, which needs macOS Automation (TCC) permission. In a
 * sandboxed/unattended environment that is denied with error -10004
 * ("A privilege violation occurred"), which is reported as `{ supported: false }`
 * so callers skip the assertion instead of failing on the environment.
 */
export function macWindowCount(processName) {
  const { spawnSync } = require('node:child_process');
  const script = 'tell application "System Events" to tell process argv to return (count of windows) as text';
  const result = spawnSync('osascript', ['-e', 'on run argv', '-e', script, '-e', 'end run', processName], { encoding: 'utf8', timeout: 15000 });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (combined.startsWith('A privilege violation') || combined.includes('-10004') || combined.includes('not authorized')) {
    return { supported: false, reason: 'osascript/System Events automation permission is denied in this environment (error -10004); cannot enumerate windows.' };
  }
  const count = Number(combined);
  if (Number.isFinite(count)) return { supported: true, count };
  return { supported: false, reason: `osascript could not report windows: ${combined.slice(0, 200) || 'no output'}` };
}

/** Capture a screenshot for evidence. Returns the path, or null when unavailable. */
export function captureScreen(path) {
  const { spawnSync } = require('node:child_process');
  if (isWindows) return null; // Not needed by the Windows path (CDP covers it).
  const command = isMac ? 'screencapture' : 'import';
  const args = isMac ? ['-x', path] : ['-window', 'root', path];
  const result = spawnSync(command, args, { timeout: 30000 });
  return result.status === 0 && existsSync(path) ? path : null;
}

// ---------------------------------------------------------------------------
// Shared native launch lifecycle (used by both smoke scripts)
// ---------------------------------------------------------------------------

/** WKWebView / WebKit noise that is expected and must never fail a run. */
const EXPECTED_STDERR = [
  'could not create directory',          // WebKit cache dirs denied by the sandbox
  'WebKit',                              // any WebKit-internal logging
  'NSCocoaErrorDomain Code=513',         // "no permission to save"
];

/**
 * Launch the built app with a fixture and run the platform-appropriate checks.
 *
 * Windows: resolves as soon as the app is up (`result: 'ready'`) so the caller
 *          can attach over CDP to WebView2 and run the full assertion set.
 * macOS/Linux: no CDP endpoint exists, so this runs launch + liveness + window +
 *          clean-quit checks and resolves `result: 'skipped'` carrying the
 *          explicit reason; the caller exits 0 only if `result !== 'failed'`.
 *
 * Returns `{ result: 'ready'|'skipped'|'failed', reason?, checks, child? }`.
 */
export async function launchNativeApp({ fixture, onReady }) {
  const { spawn } = require('node:child_process');
  const binary = requireNativeBinary();
  if (!binary.ok) return { result: 'skipped', reason: binary.reason, checks: [] };

  const processName = nativeProcessName(binary.path);
  // Guard against the single-instance trap: a second launch forwards its argv to
  // the first process and exits 0 in ~60 ms, which would make any liveness or
  // clean-quit assertion meaningless.
  const running = findRunningInstances(processName);
  if (running.length) {
    return {
      result: 'skipped',
      checks: [],
      reason:
        `A Float Reader instance is already running (pid ${running.join(', ')}). ` +
        'tauri-plugin-single-instance makes a new launch forward its argument and exit 0 ' +
        'immediately, so liveness cannot be observed. Quit it and re-run:\n  ' +
        (isWindows ? 'taskkill /IM "Float Reader.exe" /F' : `kill ${running.join(' ')}`),
    };
  }

  const started = Date.now();
  // WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS is a WebView2-only switch; on
  // macOS/Linux it does nothing, so it is gated to Windows.
  const port = isWindows ? 19126 : null;
  const env = isWindows
    ? { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }
    : { ...process.env };

  const child = spawn(binary.path, [fixture], { stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', chunk => { stdout += chunk; });
  child.stderr?.on('data', chunk => { stderr += chunk; });
  let exit = null;
  child.on('exit', (code, signal) => { exit = { code, signal, afterMs: Date.now() - started }; });

  const checks = [];
  const kill = () => { if (isProcessAlive(child.pid)) child.kill('SIGKILL'); };
  const noisyStderr = () => stderr.split('\n').filter(line => line.trim() && !EXPECTED_STDERR.some(needle => line.includes(needle))).length;
  const fail = reason => { kill(); return { result: 'failed', reason, checks, stderr: stderr.slice(0, 800) }; };

  if (isWindows) {
    for (let attempt = 0; attempt < 100 && exit === null; attempt++) await new Promise(r => setTimeout(r, 100));
    if (exit !== null) return { result: 'failed', reason: `App exited during startup (code ${exit.code}).`, checks, stderr: stderr.slice(0, 800) };
    return { result: 'ready', checks, child, port, binary: binary.path, processName, stderrTail: () => stderr };
  }

  // ---- macOS / Linux: lifecycle checks only (WKWebView has no CDP) ---------
  // 1. Stays alive. WKWebView needs a moment to bring up its process pool.
  await new Promise(r => setTimeout(r, 4000));
  if (exit !== null) {
    if (exit.code === 0 && noisyStderr() === 0) {
      return {
        result: 'skipped',
        checks,
        reason:
          'The app exited 0 during startup, which is what tauri-plugin-single-instance does when ' +
          'another instance already owns the session. Close any running Float Reader and re-run.',
      };
    }
    return fail(`App exited after ${exit.afterMs} ms (code ${exit.code}, signal ${exit.signal}) instead of staying open.`);
  }
  checks.push(`alive after 4s (pid ${child.pid}, started in ${Date.now() - started} ms)`);

  // 2. Window must exist. System Events needs macOS Automation permission; when it
  //    is denied we report a skip rather than pretending the window was checked.
  if (isMac) {
    const probe = macWindowCount(processName);
    if (probe.supported) {
      if (probe.count < 1) return fail('App is running but reports no windows.');
      checks.push(`window exists (System Events reported ${probe.count})`);
    } else {
      // Prefixed with SKIP so the caller never prints this as a pass.
      checks.push('SKIP window existence: no macOS automation permission');
      checks.push(`SKIP   reason: ${probe.reason}`);
    }
  } else {
    const probe = require('node:child_process').spawnSync('xdotool', ['search', '--name', 'Float Reader'], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) checks.push(`window exists (xdotool: ${probe.stdout.trim().split('\n').length} match(es))`);
    else checks.push('SKIP window existence: xdotool unavailable');
  }

  // 3. Caller-supplied checks that need the app still running.
  if (onReady) await onReady({ child, checks });

  // 4. Clean quit: SIGTERM must end the process without a crash signal.
  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 60 && exit === null; attempt++) await new Promise(r => setTimeout(r, 100));
  if (exit === null) return fail('App ignored SIGTERM and had to be force-killed.');
  const fatal = ['SIGSEGV', 'SIGABRT', 'SIGBUS', 'SIGILL', 'SIGTRAP'];
  if (exit.signal && fatal.includes(exit.signal)) return fail(`App crashed on quit: ${exit.signal} after ${exit.afterMs} ms.`);
  checks.push(`clean quit on SIGTERM (code ${exit.code}, signal ${exit.signal ?? 'none'})`);

  return {
    result: 'skipped',
    checks,
    reason: cdpUnsupportedReason(),
    stdout: stdout.slice(0, 400),
    unexpectedStderrLines: noisyStderr(),
    binary: binary.path,
  };
}

/**
 * The URL the embedded frontend gets inside the Tauri webview.
 * Windows (WebView2) serves via the custom http/https scheme host; macOS
 * (WKWebView) uses the tauri: scheme. Predicate is an inclusion test either way.
 */
export function appPageUrlMatches(url) {
  return url.includes(isMac ? 'tauri://localhost' : 'tauri.localhost');
}

/** Whether this platform can be driven over CDP at all (WebView2 only). */
export function supportsCdp() {
  return isWindows;
}

/**
 * Attach to a launched app's WebView2 over CDP and return its reader page.
 * The first WebView2 start on a fresh profile (every CI runner) is far slower
 * than on a warm desktop, so this waits on a deadline, not an attempt count.
 */
export async function connectAppPage({ child, port, stderrTail }, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const pause = ms => new Promise(done => setTimeout(done, ms));
  let browser;
  while (!browser) {
    if (child.exitCode !== null) throw Error(`App exited ${child.exitCode} before its WebView accepted CDP: ${stderrTail()}`);
    if (Date.now() > deadline) throw Error(`App is running but its WebView did not accept CDP on port ${port} within ${timeoutMs / 1000} s: ${stderrTail()}`);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await pause(250); }
  }
  for (;;) {
    const page = browser.contexts()[0]?.pages().find(candidate => appPageUrlMatches(candidate.url()));
    if (page) return { browser, page };
    if (Date.now() > deadline) { await browser.close(); throw Error('Native reader page did not load.'); }
    await pause(100);
  }
}

export function cdpUnsupportedReason() {
  return (
    'WKWebView has no Playwright CDP endpoint: Tauri v2 on macOS renders in WKWebView, ' +
    'which exposes remote inspection only through Safari > Develop > Float Reader ' +
    '(WebKit Web Inspector). chromium.connectOverCDP cannot attach to it. ' +
    'CDP assertions run on Windows/WebView2 only.'
  );
}

// ---------------------------------------------------------------------------
// Browsers for the Playwright-driven checks
// ---------------------------------------------------------------------------

/** Default per-user ms-playwright cache directory, mirroring Playwright's own rules. */
export function playwrightCacheDirs() {
  const override = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (override && override !== '0') return [override];
  if (isWindows) return [join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')];
  if (isMac) return [join(homedir(), 'Library', 'Caches', 'ms-playwright')];
  return [join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ms-playwright')];
}

function browserExecutableCandidates(dir) {
  return [
    join(dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    join(dir, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    join(dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    join(dir, 'chrome-linux', 'chrome'),
    join(dir, 'chrome-linux64', 'chrome'),
    join(dir, 'chrome-win', 'chrome.exe'),
    join(dir, 'chrome-win64', 'chrome.exe'),
    join(dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    join(dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    join(dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ];
}

/** Version-sort descending: chromium-1243 vs chromium-999 => 999 first. */
function byDescendingRevision(a, b) {
  const num = s => Number(/(\d+)$/.exec(s)?.[1] ?? 0);
  return num(b) - num(a);
}

/**
 * Every runnable Chromium in the Playwright cache, newest revision first.
 *
 * Deliberately revision-agnostic: a cache holding chromium-1243 is used even
 * though Playwright 1.64.1 would ask for chromium-1248, because 1243 is a
 * complete Chrome-for-Testing build that runs fine. Being honest about this is
 * cheaper than demanding a network download that may not be available.
 */
export function cachedChromiumCandidates() {
  const found = [];
  for (const root of playwrightCacheDirs()) {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirs = entries
      .filter(entry => entry.isDirectory() && /^chromium(_headless_shell)?-\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort(byDescendingRevision);
    // Prefer full chromium (has a headful build) over headless shell.
    dirs.sort((a, b) => Number(a.startsWith('chromium_headless_shell')) - Number(b.startsWith('chromium_headless_shell')));
    for (const name of dirs) {
      const dir = join(root, name);
      // INSTALLATION_COMPLETE marks a build Playwright finished unpacking;
      // without it we may be looking at a half-extracted or partial download.
      if (!existsSync(join(dir, 'INSTALLATION_COMPLETE'))) continue;
      for (const candidate of browserExecutableCandidates(dir)) {
        if (existsSync(candidate)) found.push({ path: candidate, origin: `Playwright cache ${name}` });
      }
    }
  }
  return found;
}

/**
 * Installed branded browsers, in deterministic preference order, per platform.
 * Windows WebView2 == Edge, so every Windows CI image has Edge, which is exactly
 * why the config used to hardcode channel 'msedge'. macOS/Linux have no Edge by
 * default, so Chrome is the branded choice and the bundled Chromium is the
 * fallback.
 */
export function brandedBrowserCandidates() {
  const candidates = [];
  const add = (path, channel, origin) => { if (path && existsSync(path)) candidates.push({ path, channel, origin }); };
  if (isWindows) {
    const roots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) {
      add(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'chrome', 'Google Chrome');
      add(join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'msedge', 'Microsoft Edge');
    }
  } else if (isMac) {
    for (const base of ['/Applications', join(homedir(), 'Applications')]) {
      add(join(base, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'), 'chrome', 'Google Chrome');
      add(join(base, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'), 'msedge', 'Microsoft Edge');
      // Chromium before Brave: see resolveChromiumExecutable() for why stock
      // builds are preferred over vendor-modified ones.
      add(join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'), 'chromium', 'Chromium');
      add(join(base, 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'), 'chrome', 'Brave Browser');
    }
  } else {
    for (const dir of ['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome']) {
      add(join(dir, 'google-chrome'), 'chrome', 'Google Chrome');
      add(join(dir, 'google-chrome-stable'), 'chrome', 'Google Chrome (stable)');
      add(join(dir, 'microsoft-edge'), 'msedge', 'Microsoft Edge');
      add(join(dir, 'chromium'), 'chromium', 'Chromium');
      add(join(dir, 'chromium-browser'), 'chromium', 'Chromium');
    }
  }
  return candidates;
}

/**
 * Resolve the Chromium executable + channel for headless Chromium runs.
 *
 * Rule, in order (stops at the first hit, so the result is deterministic):
 *   1. CHROME_PATH, if set -- an explicit operator override always wins.
 *   2. A trusted branded browser (Google Chrome / Microsoft Edge) for this OS.
 *   3. Any complete build in the Playwright cache (stock Chromium), newest first.
 *   4. A vendor-modified branded browser (Brave), only if nothing better exists.
 *   5. Playwright's own resolution (its bundled build, which needs
 *      `npx playwright install chromium`).
 *
 * Returns `{ executablePath?: string, channel?: string, origin, note? }`.
 * Passing `channel` unconditionally is what broke macOS, so it is only set when
 * a branded browser was actually found -- never as a default guess.
 */
export function resolveChromiumExecutable() {
  const override = process.env.CHROME_PATH?.trim();
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`CHROME_PATH is set to ${override} but that file does not exist. Unset it or point it at a Chromium binary.`);
    }
    return { executablePath: override, origin: 'CHROME_PATH override' };
  }
  const branded = brandedBrowserCandidates()[0];
  const cached = cachedChromiumCandidates()[0];
  // A stock Chromium build from the Playwright cache outranks a *vendor-modified*
  // branded browser: vendor builds are patched in ways that change layout timing,
  // which makes them an unreliable target for layout assertions. Measured on this
  // macOS box: Brave loses the text adapter's resize anchor (source line 333 ->
  // 665) while stock Chromium-for-Testing holds it, so Brave results would be a
  // false signal. Google Chrome / Microsoft Edge are treated as trusted branded
  // builds and still win, since they are what the app actually targets.
  const trustedVendor = branded && !/Brave/i.test(branded.origin);
  if (trustedVendor) return { executablePath: branded.path, channel: branded.channel, origin: branded.origin };
  if (cached) {
    return {
      executablePath: cached.path,
      origin: cached.origin,
      note: `using ${cached.origin} (not necessarily the exact revision Playwright expects; run "npx playwright install chromium" for the pinned build)`,
    };
  }
  if (branded) {
    return {
      executablePath: branded.path,
      channel: branded.channel,
      origin: branded.origin,
      note: `no stock Chromium found; ${branded.origin} is vendor-modified and may change layout timing (run "npx playwright install chromium" for a stock build)`,
    };
  }
  return {
    origin: "Playwright's own bundled Chromium (not found in cache)",
    note: 'if launch fails with "Executable doesn\'t exist", run: npx playwright install chromium',
  };
}

/**
 * Whether Playwright's own bundled Chromium is present on disk. Used where a
 * channel is preferable but a missing download must not be a hard failure.
 */
export function bundledChromiumExists() {
  try {
    const { chromium } = require('playwright-core');
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/** Human-readable summary for logs (PATH-ish, for debugging CI only). */
export function describeEnvironment() {
  return {
    platform: platformLabel,
    arch: process.arch,
    node: process.version,
    pathEntries: (process.env.PATH ?? '').split(delimiter).length,
    playwrightCache: playwrightCacheDirs().filter(existsSync),
    cachedChromium: cachedChromiumCandidates().map(candidate => candidate.origin),
    brandedBrowsers: brandedBrowserCandidates().map(candidate => `${candidate.origin} (${candidate.path})`),
  };
}
