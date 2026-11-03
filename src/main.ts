import './style.css';
import { defaultOptions, type Position, type ReaderAdapter, type ReaderOptions } from './types';
import { desktop, native, state, browserFile, persist, openExternal, confirmDocument, openLibraryDocument, chooseDocument, imageFormats, type Opened, type WindowState } from './bridge';
import { createLibrary } from './library';
import { ImageAdapter } from './adapters/image';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="toolbar"><button id="library-toggle" aria-label="Document library" aria-controls="library-root" aria-expanded="false" title="Document library (Ctrl+B)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m-3-12v8"/></svg></button><button id="open" title="Open file (Ctrl+O)">Open</button><div class="title"><strong id="filename">Float Reader</strong><span id="filekind">A little room to read</span></div><button id="pin" aria-pressed="false" title="Always on top (Ctrl+Shift+T)">Pin</button><button id="lock" aria-pressed="false" title="Lock dimensions (Ctrl+Shift+L)">Lock</button><button id="menu-toggle" aria-label="Reader menu" aria-expanded="false">···</button></header>
  <aside id="notice" role="status" hidden><span></span><button id="retry-save" hidden>Retry save</button><button id="dismiss-notice" aria-label="Dismiss message">×</button></aside>
  <div id="loading" role="status" hidden><span></span><button id="cancel">Cancel</button></div>
  <div id="reader-layout"><div id="library-root"></div>
  <main id="workspace"><section id="empty"><div class="book-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 3v18m4-13h3m-3 4h3"/></svg></div><p class="eyebrow">KEEP YOUR PLACE</p><h1>A little room<br>to read.</h1><p>Your document, beside your work.<br>Open a file and settle in.</p><button id="empty-open" class="primary">Open a document <span>↗</span></button><p class="formats">PDF · EPUB · MARKDOWN · TEXT</p><div id="recents"></div><p id="preview-note" hidden>Browser preview · Pin and size lock are available in the desktop app.</p></section></main>
  </div>
  <footer><button id="previous" aria-label="Previous page" title="Previous page (PgUp)" disabled>←</button><button id="position" title="Go to location (Ctrl+G)" disabled>Ready when you are</button><button id="next" aria-label="Next page" title="Next page (PgDn)" disabled>→</button><input id="progress" type="range" aria-label="Document position" title="Click or drag to jump through the document" min="0" max="100" step="1" value="0" disabled></footer>
  <dialog id="menu"><div class="dialog-head"><h2>Reader controls</h2><button data-close aria-label="Close menu">×</button></div><div class="menu-grid">
    <button data-action="goto">Go to… <kbd>Ctrl G</kbd></button><button data-action="outline">Contents</button><button data-action="back">Back after jump <kbd>Alt ←</kbd></button>
    <button data-action="pin">Toggle pin <kbd>Ctrl Shift T</kbd></button><button data-action="lock">Toggle size lock <kbd>Ctrl Shift L</kbd></button>
    <button data-action="compact">Compact window</button><button data-action="reading">Reading window</button>
    <button data-action="fit-page">Fit page <kbd>Ctrl 0</kbd></button><button data-action="fit-width">Fit width <kbd>Ctrl 2</kbd></button><button data-action="rotate">Rotate page 90°</button>
    <button data-action="smaller">Smaller text / zoom <kbd>Ctrl −</kbd></button><button data-action="larger">Larger text / zoom <kbd>Ctrl +</kbd></button><button data-action="type">Typography & wrapping</button>
    <button data-action="start">First location</button><button data-action="end">Last location</button><button data-action="screen-previous">Previous screen</button><button data-action="screen-next">Next screen</button>
    <button data-action="shortcuts">Keyboard shortcuts</button><button data-action="clear-recents">Clear recent files</button><button data-action="clear-data">Delete saved reading data…</button>
  </div></dialog>
  <dialog id="jump"><form><div class="dialog-head"><h2>Go to location</h2><button type="button" data-close aria-label="Close">×</button></div><label id="jump-label" for="target">Location</label><input id="target" required autocomplete="off"><p id="jump-error" role="alert"></p><button class="primary" type="submit">Go to location</button></form></dialog>
  <dialog id="password"><form><h2>Password required</h2><label for="secret">Document password</label><input id="secret" type="password" autocomplete="off"><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Open document</button></div></form></dialog>
  <dialog id="contents"><div class="dialog-head"><h2>Contents</h2><button data-close aria-label="Close contents">×</button></div><div id="outline-list"></div></dialog>
  <dialog id="typography"><div class="dialog-head"><h2>Reading settings</h2><button data-close aria-label="Close settings">×</button></div><label>Text size <input id="font-size" type="number" min="12" max="40" value="18"></label><label>Line spacing <select id="line-height"><option>1.4</option><option selected>1.65</option><option>1.9</option><option>2.2</option></select></label><label>Margins <select id="margin"><option value="12">Narrow</option><option value="24" selected>Comfortable</option><option value="40">Wide</option></select></label><label class="check"><input id="wrap" type="checkbox" checked>Wrap plain text</label></dialog>
  <dialog id="shortcuts"><div class="dialog-head"><h2>Keyboard shortcuts</h2><button data-close aria-label="Close shortcuts">×</button></div><dl><dt>Next / previous page</dt><dd>PgDn / PgUp</dd><dt>Page mode navigation</dt><dd>Right / Left</dd><dt>Next / previous screen</dt><dd>Space / Shift Space</dd><dt>Scroll</dt><dd>Up / Down</dd><dt>First / last location</dt><dd>Home / End</dd><dt>Go to location</dt><dd>Ctrl G</dd><dt>Back after a jump</dt><dd>Alt Left</dd><dt>Open file</dt><dd>Ctrl O</dd><dt>Document library</dt><dd>Ctrl B</dd><dt>Pin / size lock</dt><dd>Ctrl Shift T / L</dd><dt>Fit page / width</dt><dd>Ctrl 0 / 2</dd><dt>Zoom / text size</dt><dd>Ctrl + / −</dd><dt>Dismiss a dialog</dt><dd>Escape</dd></dl></dialog>
  <dialog id="delete-data"><h2>Delete saved reading data?</h2><p>This removes saved positions and reading settings. Your documents and recent-file list remain. The current position will be saved again when you navigate.</p><div class="dialog-actions"><button data-close>Cancel</button><button id="confirm-delete" class="danger">Delete reading data</button></div></dialog>
  <input id="file-input" type="file" accept=".pdf,.epub,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp" hidden>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const scrubber = $<HTMLInputElement>('progress');
let scrubbing = false, scrubRequest = 0;
let reader: ReaderAdapter | undefined;
let active: Opened | undefined;
let options: ReaderOptions = { ...defaultOptions };
let position: Position | undefined;
let windowState: WindowState = { width: 420, height: 620, pinned: false, locked: false };
let request = 0, dirty = false, saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveQueue = Promise.resolve();
let activeHost: HTMLElement | undefined;
let cancelPending: (() => void) | undefined;

function notify(message: string, retry = false) { $('notice').hidden = false; $('notice').querySelector('span')!.textContent = message; $('retry-save').hidden = !retry; }
function fail(error: unknown) { notify(error instanceof Error ? error.message : String(error)); }
function updateWindow(next: WindowState) { windowState = next; $('pin').setAttribute('aria-pressed', String(next.pinned)); $('pin').textContent = next.pinned ? 'Pinned' : 'Pin'; $('lock').setAttribute('aria-pressed', String(next.locked)); $('lock').textContent = next.locked ? 'Locked' : 'Lock'; }
function showPosition(p: Position) {
  position = p;
  const percent = Math.max(0, Math.min(100, p.fraction * 100));
  const label = active?.format === 'epub' && reader?.mode === 'paginated' ? `${p.label} position` : `${p.label} · ${reader?.mode === 'fixed' ? '' : '≈'}${Math.round(percent)}% position`;
  if (!scrubbing) {
    $('position').textContent = label; $('position').title = `${label} · Go to location (Ctrl+G)`;
    scrubber.min = p.scrub.unit === 'percent' ? '0' : '1';
    scrubber.max = String(p.scrub.total);
    scrubber.step = p.scrub.unit === 'percent' ? '0.1' : '1';
    scrubber.value = String(p.scrub.current);
    scrubber.disabled = Number(scrubber.max) <= Number(scrubber.min);
    updateScrubValue();
  }
  dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(() => void flush(), 650);
}
function updateScrubValue(preview = false) {
  if (!position) return;
  const value = scrubber.valueAsNumber, min = Number(scrubber.min), max = Number(scrubber.max);
  const label = position.scrub.unit === 'percent' ? `${value.toFixed(1)}% position`
    : `${position.scrub.unit === 'page' ? 'Page' : 'Line'} ${value} of ${max}`;
  scrubber.style.setProperty('--scrub-fill', `${max > min ? (value - min) / (max - min) * 100 : 0}%`);
  scrubber.setAttribute('aria-valuenow', String(value));
  scrubber.setAttribute('aria-valuetext', label);
  if (preview) $('position').textContent = `${label} · release to jump`;
}
scrubber.oninput = () => { scrubbing = true; ++scrubRequest; updateScrubValue(true); };
scrubber.onchange = () => {
  if (!reader || !position) return;
  const current = reader, token = ++scrubRequest, value = scrubber.value;
  const unit = position.scrub.unit;
  scrubbing = true;
  const jump = unit !== 'page' && value === scrubber.max ? current.navigate('end')
    : current.goTo(unit === 'percent' ? `${value}%` : value);
  void jump.catch(error => { if (reader === current) fail(error); }).finally(() => {
    if (reader !== current || token !== scrubRequest) return;
    scrubbing = false; showPosition(current.getPosition());
  });
};
scrubber.onpointercancel = () => {
  ++scrubRequest; scrubbing = false;
  if (reader) showPosition(reader.getPosition());
};
function flush(): Promise<void> {
  if (!active || !position || !dirty) return saveQueue;
  const doc = active, loc = structuredClone(position.locator), prefs = { ...options }; dirty = false;
  saveQueue = saveQueue.then(() => persist(doc, loc, prefs)).catch(() => { if (active?.id === doc.id) dirty = true; notify('Progress could not be saved. Reading is still available.', true); });
  return saveQueue;
}
setInterval(() => { if (dirty) void flush(); }, 1500);
function showDialog(id: string) { $(id) instanceof HTMLDialogElement && ($<HTMLDialogElement>(id).showModal()); }
function closeDialog(dialog: HTMLDialogElement) { dialog.close(); activeHost?.focus(); $('menu-toggle').setAttribute('aria-expanded', 'false'); }
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => { dialog.addEventListener('close', () => { activeHost?.focus(); if (dialog.id === 'menu') $('menu-toggle').setAttribute('aria-expanded', 'false'); }); });
document.querySelectorAll<HTMLElement>('[data-close]').forEach(button => button.onclick = () => closeDialog(button.closest('dialog')!));
const library = createLibrary($('library-root'), {
  open: path => load(() => openLibraryDocument(path), path.split(/[\\/]/).pop()),
  error: fail,
});
$('library-toggle').onclick = () => library.toggle();

async function password(): Promise<string | null> {
  const dialog = $<HTMLDialogElement>('password'), form = dialog.querySelector('form')!, input = $<HTMLInputElement>('secret'); input.value = '';
  return new Promise(resolve => {
    let result: string | null = null;
    form.onsubmit = event => { event.preventDefault(); result = input.value; dialog.close(); };
    dialog.addEventListener('close', () => { input.value = ''; resolve(result); }, { once: true });
    dialog.showModal(); input.focus();
  });
}
async function adapter(format: string): Promise<ReaderAdapter> {
  if (format === 'pdf') return new (await import('./adapters/pdf')).PdfAdapter();
  if (format === 'epub') return new (await import('./adapters/epub')).EpubAdapter();
  if (Object.hasOwn(imageFormats, format)) return new ImageAdapter();
  return new (await import('./adapters/text')).TextAdapter();
}
async function load(open: () => Promise<Opened | null>, label = 'document'): Promise<boolean> {
  const token = ++request; cancelPending?.();
  $('loading').hidden = false; $('loading').querySelector('span')!.textContent = `Opening ${label}…`;
  let candidate: ReaderAdapter | undefined, staging: HTMLElement | undefined;
  const urls: string[] = [];
  cancelPending = () => { candidate?.destroy(); staging?.remove(); for (const url of urls) URL.revokeObjectURL(url); };
  try {
    await flush(); const doc = await open(); if (!doc || token !== request) return false;
    $('loading').querySelector('span')!.textContent = `Opening ${doc.name}…`;
    candidate = await adapter(doc.format); if (token !== request) return false;
    staging = document.createElement('section'); staging.className = 'reader-host staging'; staging.tabIndex = 0; staging.setAttribute('aria-label', 'Reading surface'); $('workspace').append(staging);
    const prefs = { ...defaultOptions, ...doc.previousState?.options };
    const current = candidate;
    await candidate.open({ ...doc, bytes: doc.bytes }, staging, {
      onPosition: p => { if (reader === current) showPosition(p); }, onError: fail, openExternal, requestPassword: password,
      resolveImage: desktop ? async relative => { const result = await native<{bytes: number[]; mime: string}>('read_relative_image', { path: doc.path, relative }); const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: result.mime })); urls.push(url); return url; } : undefined,
    }, prefs);
    if (doc.previousState?.locator) await candidate.restore(doc.previousState.locator);
    if (token !== request) return false;
    await confirmDocument(doc).catch(error => notify(`Your library could not be saved. Reading is still available. ${error instanceof Error ? error.message : String(error)}`));
    await flush();
    if (token !== request) return false;
    reader?.destroy(); activeHost?.remove();
    doc.bytes = new Uint8Array();
    reader = candidate; active = doc; options = prefs; activeHost = staging; staging.classList.remove('staging'); $('empty').hidden = true;
    ++scrubRequest; scrubbing = false;
    $('filename').textContent = doc.name; $('filename').title = doc.path; $('filekind').textContent = `${doc.format.toUpperCase()} · ${reader.mode === 'fixed' ? 'Page view' : reader.mode === 'paginated' ? 'Reading view' : 'Scroll view'}`;
    for (const id of ['previous', 'position', 'next']) $<HTMLButtonElement>(id).disabled = false;
    showPosition(reader.getPosition()); staging.focus(); candidate = undefined; staging = undefined; cancelPending = undefined;
    if (doc.warning) notify(doc.warning);
    await library.refresh(doc.path).catch(fail);
    return true;
  } catch (error) { if (token === request) fail(error); return false; }
  finally { candidate?.destroy(); staging?.remove(); if (token === request) { $('loading').hidden = true; cancelPending = undefined; } }
}
function openFile(path?: string) { if (desktop) void load(() => chooseDocument(path), path?.split(/[\\/]/).pop()); else $<HTMLInputElement>('file-input').click(); }
$('open').onclick = () => openFile(); $('empty-open').onclick = () => openFile();
$<HTMLInputElement>('file-input').onchange = event => { const input = event.target as HTMLInputElement; if (input.files?.[0]) { const file = input.files[0]; void load(() => browserFile(file), file.name); } input.value = ''; };
$('cancel').onclick = () => { ++request; cancelPending?.(); cancelPending = undefined; $<HTMLDialogElement>('password').close(); $('loading').hidden = true; };
$('dismiss-notice').onclick = () => { $('notice').hidden = true; };
$('retry-save').onclick = () => { dirty = true; void flush(); };
async function navigate(action: Parameters<ReaderAdapter['navigate']>[0]) { try { await reader?.navigate(action); } catch (error) { fail(error); } }
$('previous').onclick = () => void navigate('previous'); $('next').onclick = () => void navigate('next');
function jump() { if (!reader) return; $('jump-label').textContent = reader.mode === 'fixed' ? 'Physical page number' : active?.format === 'epub' ? 'Book percentage (e.g. 35%) or chapter' : 'Source line number'; $('jump-error').textContent = ''; $<HTMLInputElement>('target').value = ''; showDialog('jump'); $<HTMLInputElement>('target').focus(); }
$('position').onclick = jump;
$('jump').querySelector('form')!.onsubmit = event => { event.preventDefault(); void reader?.goTo($<HTMLInputElement>('target').value.trim()).then(() => closeDialog($<HTMLDialogElement>('jump'))).catch(error => { $('jump-error').textContent = String(error instanceof Error ? error.message : error); }); };
async function toggle(which: 'pin' | 'lock') { if (!desktop) { notify('Pin and size lock are available in the desktop app.'); return; } try { updateWindow(await native(`set_${which}`, { enabled: !(which === 'pin' ? windowState.pinned : windowState.locked) })); } catch (error) { fail(error); } }
$('pin').onclick = () => void toggle('pin'); $('lock').onclick = () => void toggle('lock');
$('menu-toggle').onclick = () => { $('menu-toggle').setAttribute('aria-expanded', 'true'); showDialog('menu'); };
async function changeOptions(next: Partial<ReaderOptions>) { if (!reader) return; const previous = options; options = { ...options, ...next }; try { await reader.setOptions(options); showPosition(reader.getPosition()); } catch (error) { options = previous; fail(error); } }
async function action(name: string) {
  if (name === 'goto') jump();
  else if (name === 'pin' || name === 'lock') await toggle(name);
  else if (name === 'compact' || name === 'reading') { if (!desktop) return notify('Window presets are available in the desktop app.'); updateWindow(await native('set_preset', { preset: name })); }
  else if (name === 'fit-page' || name === 'fit-width') await changeOptions({ fit: name === 'fit-page' ? 'page' : 'width', zoom: 1 });
  else if (name === 'rotate') await changeOptions({ rotation: (options.rotation + 90) % 360 });
  else if (name === 'smaller' || name === 'larger') { const delta = name === 'larger' ? 1 : -1; await changeOptions(reader?.mode === 'fixed' ? { zoom: Math.max(.25, Math.min(4, options.zoom + delta * .1)) } : { fontSize: Math.max(12, Math.min(40, options.fontSize + delta * 2)) }); }
  else if (name === 'type') { $<HTMLInputElement>('font-size').value = String(options.fontSize); $<HTMLSelectElement>('line-height').value = String(options.lineHeight); $<HTMLSelectElement>('margin').value = String(options.margin); $<HTMLInputElement>('wrap').checked = options.wrap; showDialog('typography'); }
  else if (name === 'outline') { const list = $('outline-list'); list.replaceChildren(); const entries = reader?.outline() ?? []; if (!entries.length) list.textContent = 'No contents outline in this document.'; for (const item of entries) { const button = document.createElement('button'); button.textContent = item.label; button.onclick = () => { void reader?.goTo(item.target).then(() => closeDialog($<HTMLDialogElement>('contents'))).catch(fail); }; list.append(button); } showDialog('contents'); }
  else if (name === 'shortcuts') showDialog('shortcuts');
  else if (name === 'clear-data') showDialog('delete-data');
  else if (name === 'clear-recents') { if (desktop) await native('clear_recents'); $('recents').replaceChildren(); notify('Recent-file list cleared. Documents and saved positions are unchanged.'); }
  else if (['back', 'start', 'end', 'screen-next', 'screen-previous'].includes(name)) await navigate(name as Parameters<ReaderAdapter['navigate']>[0]);
}
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.onclick = () => { closeDialog($<HTMLDialogElement>('menu')); void action(button.dataset.action!).catch(fail); });
for (const id of ['font-size', 'line-height', 'margin', 'wrap']) $(id).onchange = () => { const fontSize = Number($<HTMLInputElement>('font-size').value); if (fontSize < 12 || fontSize > 40) return; void changeOptions({ fontSize, lineHeight: Number($<HTMLSelectElement>('line-height').value), margin: Number($<HTMLSelectElement>('margin').value), wrap: $<HTMLInputElement>('wrap').checked }); };
$('confirm-delete').onclick = () => { void (async () => { await flush(); if (desktop) await native('clear_reading_data'); else for (const key of Object.keys(localStorage)) if (key.startsWith('float-preview:')) localStorage.removeItem(key); dirty = false; closeDialog($<HTMLDialogElement>('delete-data')); notify('Saved reading data deleted. Your documents are unchanged.'); })().catch(fail); };

document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'b') { event.preventDefault(); library.toggle(); return; }
  const target = event.composedPath()[0];
  if (target instanceof HTMLElement && (target.closest('input,textarea,select,[contenteditable="true"]'))) return;
  const key = event.key.toLowerCase(); let operation: (() => void) | undefined;
  if (event.ctrlKey && event.shiftKey && key === 't') operation = () => void toggle('pin');
  else if (event.ctrlKey && event.shiftKey && key === 'l') operation = () => void toggle('lock');
  else if (event.ctrlKey && key === 'o') operation = () => openFile();
  else if (event.ctrlKey && key === 'g') operation = jump;
  else if (event.ctrlKey && ['+', '=', '-', '0', '2'].includes(key)) operation = () => void action(key === '0' ? 'fit-page' : key === '2' ? 'fit-width' : key === '-' ? 'smaller' : 'larger').catch(fail);
  else if (event.altKey && key === 'arrowleft') operation = () => void navigate('back');
  else if (!event.ctrlKey && !event.altKey && activeHost && (target === document.body || target instanceof Node && activeHost.contains(target))) {
    const horizontal = target instanceof HTMLElement && target.closest('pre,table,[data-horizontal-scroll]');
    const mapping: Record<string, Parameters<ReaderAdapter['navigate']>[0]> = { pagedown: 'next', pageup: 'previous', home: 'start', end: 'end', ' ': event.shiftKey ? 'screen-previous' : 'screen-next' };
    if (reader?.mode !== 'scroll' && !horizontal) { mapping.arrowright = 'next'; mapping.arrowleft = 'previous'; }
    if (mapping[key]) operation = () => void navigate(mapping[key]);
  }
  if (operation) { event.preventDefault(); operation(); }
});
if (!desktop) { $('preview-note').hidden = false; document.addEventListener('dragover', event => event.preventDefault()); document.addEventListener('drop', event => { event.preventDefault(); if (event.dataTransfer?.files.length !== 1) return notify('Drop one document at a time.'); const file = event.dataTransfer.files[0]; void load(() => browserFile(file), file.name); }); }
async function initialize() {
  const saved = await state(); updateWindow(saved.window); if (saved.warning) notify(saved.warning);
  if (saved.recents.length) { const heading = document.createElement('h2'); heading.textContent = 'Recently opened'; $('recents').append(heading); for (const recent of saved.recents) { const row = document.createElement('div'); row.className = 'recent'; const button = document.createElement('button'); button.textContent = recent.name; button.title = recent.path; button.onclick = () => { void load(() => openLibraryDocument(recent.path), recent.name); }; const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${recent.name} from recents`); remove.onclick = () => { void native('remove_recent', { path: recent.path }).then(() => row.remove()).catch(fail); }; row.append(button, remove); $('recents').append(row); } }
  await library.refresh().catch(fail);
  if (desktop) {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('open-request', event => openFile(event.payload));
    await listen<WindowState>('window-state', event => updateWindow(event.payload));
    await listen<string | null>('reader-warning', event => { if (event.payload) notify(event.payload); });
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    let closing = false; await getCurrentWindow().onCloseRequested(async event => { if (closing) return; event.preventDefault(); await flush(); closing = true; await getCurrentWindow().close(); });
    const pending = await native<string | null>('pending_open'); if (pending) openFile(pending);
  }
}
void initialize().catch(fail);
window.addEventListener('beforeunload', () => { void flush(); });
