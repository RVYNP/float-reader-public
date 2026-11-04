import './library.css';
import { addDocuments, desktop, editLibrary, getLibrary, chooseSourceRoot, locateLibraryDocument, readLibraryThumbnail, indexFolder } from './bridge';
import { emptyLibrary, type Collection, type Library, type LibraryDocument } from './catalog-types';
import { isImage, searchText } from './library-query';
import { clampLibraryWidth, libraryWidth, libraryWidthBounds, parseLibraryWidth, type LibrarySide } from './library-layout';

type Callbacks = { open: (path: string) => Promise<boolean>; error: (error: unknown) => void };
type Filter = { kind: 'all' | 'favorites' | 'unfiled' } | { kind: 'collection' | 'source'; id: string };
const pageSize = 40;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, label?: string, key?: string) {
  const node = element('button', '', text); node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  if (key) node.dataset.libraryFocus = key;
  return node;
}
function timestamp(value: number | string) {
  const numeric = Number(value); return Number.isFinite(numeric) ? numeric : Date.parse(String(value)) || 0;
}
function option(select: HTMLSelectElement, value: string, label: string) {
  const node = element('option', '', label); node.value = value; select.append(node);
}
function check(label: string, checked = false) {
  const row = element('label', 'library-check'); const input = element('input'); input.type = 'checkbox'; input.checked = checked;
  row.append(input, element('span', '', label)); return { row, input };
}
function descendantIds<T extends { id: string; parentId: string | null }>(items: T[], id: string): Set<string> {
  const result = new Set([id]); const children = new Map<string, string[]>();
  for (const item of items) if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item.id]);
  const pending = [id];
  while (pending.length) for (const child of children.get(pending.pop()!) ?? []) if (!result.has(child)) { result.add(child); pending.push(child); }
  return result;
}
// Lucide outlines, drawn at the toolbar's stroke weight.
function icon(paths: string) {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const panelIcon = { left: icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>'), right: icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>') };
const closeIcon = icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
function savedPreference(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function savePreference(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Optional preference. */ } }
function orderedTree<T extends { id: string; name: string; parentId: string | null }>(items: T[]): { item: T; depth: number }[] {
  const ids = new Set(items.map(item => item.id)); const visited = new Set<string>(); const result: { item: T; depth: number }[] = [];
  const children = new Map<string | null, T[]>();
  for (const item of items) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  function visit(item: T, depth: number) {
    if (visited.has(item.id)) return; visited.add(item.id); result.push({ item, depth });
    for (const child of children.get(item.id) ?? []) visit(child, depth + 1);
  }
  for (const item of children.get(null) ?? []) visit(item, 0);
  // Corrupt/cyclic source hierarchy must remain inspectable, never hide entries.
  for (const item of items) if (!visited.has(item.id)) visit(item, 0);
  return result;
}

export function createLibrary(root: HTMLElement, callbacks: Callbacks): { refresh: (activePath?: string) => Promise<void>; toggle: () => void } {
  // Drawer mode: at >=720 px the library is a resizable drawer floating over the page; below it
  // becomes a compact sheet with a scrim, a focus trap and workspace `inert`.
  const wide = window.matchMedia('(min-width: 720px)');
  const layout = document.getElementById('reader-layout');
  const toggleButton = document.getElementById('library-toggle');
  const workspace = document.getElementById('workspace');
  const preferenceKey = () => `hold-my-brief:library-${wide.matches ? 'wide' : 'narrow'}`;
  function preference() { try { const saved = localStorage.getItem(preferenceKey()); return saved === null ? wide.matches : saved === 'open'; } catch { return wide.matches; } }
  let visible = preference(); let library: Library = emptyLibrary(); let filter: Filter = { kind: 'all' };
  let activePath: string | undefined; let busy = false, loaded = false, revision = 0, page = 0;
  let loadError = false; let modal: HTMLDialogElement | undefined; let modalError: HTMLElement | undefined;
  let matches: LibraryDocument[] = []; let imageSequence: string[] = [];
  const expanded = new Set<string>(); const knownCollections = new Set<string>();
  let collectionMatches = new Map<string, Set<string>>();
  let searchable = new Map<string, string>();
  const busyDisabled = new Map<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement, boolean>();

  root.classList.add('library-root');
  const backdrop = button('', 'Close library'); backdrop.className = 'library-backdrop'; backdrop.tabIndex = -1;
  const panel = element('aside', 'library-panel'); panel.setAttribute('aria-label', 'Reference library');
  const header = element('div', 'library-header'); const headerActions = element('div', 'library-header-actions');
  const dock = button('', undefined, 'dock'); dock.className = 'library-dock';
  const close = button('', 'Close library'); close.innerHTML = closeIcon; close.title = 'Close library';
  headerActions.append(dock, close); header.append(element('h2', '', 'Library'), headerActions);
  const tools = element('div', 'library-tools');
  const add = button('Add files', 'Add local documents or images', 'add'); add.className = 'library-add';
  const sourcesButton = button('Sources', 'Index folders and manage source locations', 'sources'); tools.append(add, sourcesButton);
  const searchLabel = element('label', 'library-search-label', 'Search library');
  const search = element('input', 'library-search'); search.type = 'search'; search.placeholder = 'Title, tags, notes, folder…'; search.id = 'library-search'; search.autocomplete = 'off'; searchLabel.htmlFor = search.id;
  const facets = element('div', 'library-facets');
  const format = element('select'); format.setAttribute('aria-label', 'Filter by format');
  for (const [value, text] of [['', 'All formats'], ['image', 'Images'], ['document', 'Documents']]) option(format, value, text);
  const availability = element('select'); availability.setAttribute('aria-label', 'Filter by availability');
  for (const [value, text] of [['', 'Any availability'], ['ready', 'Ready'], ['missing', 'Missing']]) option(availability, value, text);
  facets.append(format, availability);
  const navigation = element('nav', 'library-navigation'); navigation.setAttribute('aria-label', 'Library filters and collections');
  const documentsHead = element('div', 'library-documents-head'); const resultCount = element('span', 'library-result-count'); resultCount.setAttribute('role', 'status');
  const sort = element('select', 'library-sort'); sort.setAttribute('aria-label', 'Sort library'); option(sort, 'recent', 'Recent first'); option(sort, 'name', 'Name A–Z');
  documentsHead.append(resultCount, sort);
  const documents = element('div', 'library-documents'); documents.setAttribute('aria-label', 'Library items'); documents.setAttribute('role', 'list');
  const pager = element('div', 'library-pager');
  const fileInput = element('input'); fileInput.type = 'file'; fileInput.accept = '.pdf,.epub,.md,.markdown,.txt,.png,.jpeg,.jpg,.webp,.gif,.avif,.bmp'; fileInput.multiple = true; fileInput.hidden = true;
  panel.append(header, tools, searchLabel, search, facets, navigation, documentsHead, documents, pager, fileInput);
  const resizeHandle = element('div', 'library-resize'); resizeHandle.tabIndex = 0;
  for (const [name, value] of [['role', 'separator'], ['aria-orientation', 'vertical'], ['aria-label', 'Resize library'], ['aria-controls', root.id]]) resizeHandle.setAttribute(name, value);
  const grip = element('span', 'library-resize-grip'); grip.append(element('span'), element('span'), element('span'));
  const tip = element('span', 'library-resize-tip'); tip.setAttribute('aria-hidden', 'true'); const tipValue = element('span', 'library-resize-value');
  tip.append(element('span', '', 'Drag to resize · double-click to reset'), tipValue); resizeHandle.append(grip, tip);
  root.replaceChildren(backdrop, panel, resizeHandle);
  const imageNavigation = element('div', 'library-image-navigation'); imageNavigation.hidden = true; imageNavigation.setAttribute('aria-label', 'Images in selected collection'); imageNavigation.setAttribute('role', 'group'); workspace?.append(imageNavigation);

  // Drawer width and dock side. The drawer floats over the reading panel, so its width never
  // affects the page. The stored width is the user's preference; the applied width is re-clamped
  // to the current window so growing the window restores it.
  const widthKey = 'hold-my-brief:library-width', sideKey = 'hold-my-brief:library-side';
  let preferredWidth = parseLibraryWidth(savedPreference(widthKey)); let width: number = libraryWidth.default;
  let side: LibrarySide = savedPreference(sideKey) === 'right' ? 'right' : 'left';
  const viewport = () => layout?.clientWidth || window.innerWidth;
  function applyWidth(next: number) {
    const bounds = libraryWidthBounds(viewport()); width = clampLibraryWidth(next, viewport());
    // Set on the root (it declares its own --library-width, which would shadow an inherited one)
    // and on the layout (the workspace reads it to keep the floating view controls clear of a
    // right-docked drawer).
    root.style.setProperty('--library-width', `${width}px`);
    layout?.style.setProperty('--library-width', `${width}px`);
    tipValue.textContent = `${width} px`;
    resizeHandle.setAttribute('aria-valuenow', String(width)); resizeHandle.setAttribute('aria-valuetext', `${width} pixels wide`);
    resizeHandle.setAttribute('aria-valuemin', String(bounds.min)); resizeHandle.setAttribute('aria-valuemax', String(bounds.max));
  }
  function setWidth(next: number) { applyWidth(next); preferredWidth = width; savePreference(widthKey, String(width)); }
  function applySide() {
    const other = side === 'left' ? 'right' : 'left'; layout?.classList.toggle('library-right', side === 'right');
    toggleButton?.setAttribute('data-library-side', side);
    dock.innerHTML = panelIcon[other]; dock.setAttribute('aria-label', `Move library to the ${other}`); dock.title = `Move library to the ${other}`;
  }
  dock.onclick = () => { side = side === 'left' ? 'right' : 'left'; savePreference(sideKey, side); applySide(); };
  // While dragging, only the drawer follows the pointer; it is out of flow, so the reading panel,
  // the page box and the canvas bitmap keep their exact geometry and never refit.
  let drag: { pointer: number; x: number; start: number; next?: number } | undefined; let dragFrame = 0;
  function setResizing(on: boolean) {
    document.documentElement.classList.toggle('library-resizing', on);
  }
  resizeHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || !wide.matches) return;
    event.preventDefault(); resizeHandle.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, x: event.clientX, start: width }; setResizing(true);
  });
  resizeHandle.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    const delta = event.clientX - drag.x; drag.next = drag.start + (side === 'left' ? delta : -delta);
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; if (drag?.next !== undefined) applyWidth(drag.next); });
  });
  function endDrag(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    const { next } = drag; drag = undefined; cancelAnimationFrame(dragFrame); dragFrame = 0;
    if (next !== undefined) setWidth(next);
    setResizing(false);
    if (resizeHandle.hasPointerCapture(event.pointerId)) resizeHandle.releasePointerCapture(event.pointerId);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) resizeHandle.addEventListener(type, endDrag);
  resizeHandle.addEventListener('dblclick', () => setWidth(libraryWidth.default));
  resizeHandle.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    // Arrows move the separator visually, so they mirror when the library is docked right.
    const step = (event.shiftKey ? libraryWidth.largeStep : libraryWidth.step) * (side === 'left' ? 1 : -1);
    const bounds = libraryWidthBounds(viewport());
    const next = event.key === 'ArrowRight' ? width + step : event.key === 'ArrowLeft' ? width - step : event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : event.key === 'Enter' ? libraryWidth.default : undefined;
    if (next === undefined) return;
    event.preventDefault(); setWidth(next);
  });
  let windowFrame = 0;
  window.addEventListener('resize', () => { if (!windowFrame) windowFrame = requestAnimationFrame(() => { windowFrame = 0; if (!drag) applyWidth(preferredWidth); }); });

  function applyVisibility() {
    root.hidden = !visible; layout?.classList.toggle('library-open', visible); toggleButton?.setAttribute('aria-expanded', String(visible));
    if (workspace) workspace.inert = visible && !wide.matches;
    if (visible) observeThumbnails(); else clearThumbnails();
  }
  function setVisible(next: boolean, focus = true, persist = true) {
    visible = next; if (persist) try { localStorage.setItem(preferenceKey(), next ? 'open' : 'closed'); } catch { /* Optional preference. */ }
    applyVisibility(); if (focus) (next ? search : toggleButton)?.focus();
  }
  function toggle() { if (!modal?.open) setVisible(!visible); }
  backdrop.onclick = close.onclick = () => { if (!busy) setVisible(false); };
  wide.addEventListener('change', () => { const hadFocus = root.contains(document.activeElement); visible = modal?.open ? true : preference(); applyVisibility(); if (!visible && hadFocus) toggleButton?.focus(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal?.open) { event.preventDefault(); event.stopPropagation(); if (!busy) setVisible(false); }
    if (event.key === 'Tab' && visible && !wide.matches && !modal?.open) {
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), summary')).filter(node => node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    // Reader shortcuts must never consume typing, arrows, or space in the library.
    event.stopPropagation();
  });
  imageNavigation.addEventListener('keydown', event => event.stopPropagation());
  function focusKey() { return document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement.dataset.libraryFocus : undefined; }
  function restoreFocus(key?: string, original?: HTMLElement) {
    if (!visible) { toggleButton?.focus(); return; }
    if (original?.isConnected && !original.matches(':disabled')) { original.focus(); return; }
    const replacement = key && Array.from(root.querySelectorAll<HTMLElement>('[data-library-focus]')).find(node => node.dataset.libraryFocus === key);
    (replacement || add).focus();
  }
  function setBusy(next: boolean) {
    busy = next; panel.setAttribute('aria-busy', String(next));
    if (next) for (const control of [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('button, input, select, textarea'), ...imageNavigation.querySelectorAll<HTMLButtonElement>('button')]) {
      if (!busyDisabled.has(control)) busyDisabled.set(control, control.disabled); control.disabled = true;
    }
    else { for (const [control, disabled] of busyDisabled) control.disabled = disabled; busyDisabled.clear(); }
  }
  function report(error: unknown) { if (modalError) modalError.textContent = error instanceof Error ? error.message : String(error); callbacks.error(error); }
  async function mutate(operation: () => Promise<Library>, after?: () => void) {
    if (busy) return; const key = focusKey(), hadDialog = Boolean(modal?.open); if (modalError) modalError.textContent = '';
    ++revision; setBusy(true);
    try { library = await operation(); ++revision; loaded = true; loadError = false; rebuildIndex(); render(); after?.(); }
    catch (error) { report(error); }
    finally { setBusy(false); if (!hadDialog && !modal?.open) restoreFocus(key); }
  }
  function openDialog(heading: string, trigger: HTMLElement) {
    if (busy || modal?.open) return undefined;
    const key = trigger.dataset.libraryFocus; const dialog = element('dialog', 'library-dialog'); const form = element('form');
    const headingNode = element('h2', '', heading); headingNode.id = 'library-dialog-title'; dialog.setAttribute('aria-labelledby', headingNode.id);
    const content = element('div', 'library-dialog-content'); const error = element('p', 'library-dialog-error'); error.setAttribute('role', 'alert');
    const actions = element('div', 'dialog-actions'); const cancel = button('Close'); cancel.onclick = () => dialog.close();
    actions.append(cancel); form.append(headingNode, content, error, actions); dialog.append(form); form.onsubmit = event => event.preventDefault();
    root.append(dialog); modal = dialog; modalError = error;
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (modal === dialog) { modal = undefined; modalError = undefined; } restoreFocus(key, trigger); });
    return { dialog, form, content, actions };
  }
  function labeled<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(text: string, input: T) {
    const label = element('label', 'library-field', text); label.append(input); return label;
  }
  function parentOptions(select: HTMLSelectElement, excluded = new Set<string>()) {
    option(select, '', 'Top level');
    for (const { item, depth } of orderedTree(library.collections.filter(item => !item.sourceId))) if (!excluded.has(item.id)) option(select, item.id, `${'— '.repeat(depth)}${item.name}`);
  }
  function collectionForm(trigger: HTMLElement, collection?: Collection) {
    const view = openDialog(collection ? 'Edit collection' : 'New collection', trigger); if (!view) return;
    const input = element('input'); input.required = true; input.maxLength = 120; input.autocomplete = 'off'; input.value = collection?.name ?? '';
    const parent = element('select'); parentOptions(parent, collection ? descendantIds(library.collections, collection.id) : undefined);
    const current = filter.kind === 'collection' ? library.collections.find(item => filter.kind === 'collection' && item.id === filter.id) : undefined;
    parent.value = collection?.parentId ?? (current && !current.sourceId ? current.id : '');
    const submit = button(collection ? 'Save collection' : 'Create collection'); submit.type = 'submit'; submit.className = 'primary';
    view.content.append(labeled('Collection name', input), labeled('Parent collection', parent)); view.actions.append(submit);
    if (collection) {
      const remove = button('Delete collection…'); remove.className = 'library-remove'; const confirmation = element('div', 'library-remove-confirmation'); confirmation.hidden = true;
      const confirm = button('Delete collection'); confirm.className = 'danger'; const keep = button('Keep collection');
      confirmation.append(element('p', '', 'Delete this collection only? Children move to its parent. Items, other memberships, original files, and reading positions stay intact.'), keep, confirm); view.content.append(remove, confirmation);
      remove.onclick = () => { confirmation.hidden = false; confirm.focus(); }; keep.onclick = () => { confirmation.hidden = true; remove.focus(); };
      confirm.onclick = () => void mutate(() => editLibrary({ action: 'deleteCollection', id: collection.id }), () => view.dialog.close());
    }
    input.oninput = () => input.setCustomValidity('');
    view.form.onsubmit = event => {
      event.preventDefault(); const name = input.value.trim(); if (!name) { input.setCustomValidity('Enter a collection name.'); input.reportValidity(); return; }
      const id = collection?.id ?? crypto.randomUUID();
      void mutate(async () => {
        if (!collection) return editLibrary({ action: 'createCollection', id, name, parentId: parent.value || null });
        // Separate existing command contracts; retain a successful rename if a move fails.
        let next = library;
        if (name !== collection.name) { next = await editLibrary({ action: 'renameCollection', id, name }); library = next; }
        if ((parent.value || null) !== collection.parentId) next = await editLibrary({ action: 'moveCollection', id, parentId: parent.value || null });
        return next;
      }, () => { filter = { kind: 'collection', id }; if (parent.value) expanded.add(parent.value); page = 0; render(); view.dialog.close(); });
    };
    view.dialog.showModal(); input.focus(); input.select();
  }
  function locationActions(doc: LibraryDocument, target: HTMLElement, closeDialog?: () => void) {
    const provenance = doc.source;
    if (provenance) {
      const source = element('dl', 'library-provenance');
      for (const [label, value] of [['Source', provenance.repository], ['Relative file', provenance.relativePath]]) if (value) source.append(element('dt', '', label), element('dd', '', value));
      target.append(source);
      if (provenance.removed) target.append(element('p', 'library-warning', 'No longer found in its indexed folder. This entry and your personal organization have not been deleted.'));
    }
    if (!desktop) return;
    const rootInfo = library.roots.find(item => item.id === provenance?.rootId);
    if (rootInfo) {
      target.append(element('p', 'library-dialog-help', `${rootInfo.name}: ${rootInfo.path ?? 'Not located'}`));
      if (!rootInfo.managed) { const locateRoot = button(`Locate ${rootInfo.name} root…`); locateRoot.onclick = () => void mutate(() => chooseSourceRoot(rootInfo.id), closeDialog); target.append(locateRoot); }
    }
    const locate = button('Locate this original…'); locate.onclick = () => void mutate(() => locateLibraryDocument(doc.path), closeDialog); target.append(locate);
  }
  function organize(doc: LibraryDocument, trigger: HTMLElement) {
    const view = openDialog('Organize reference', trigger); if (!view) return;
    view.content.append(element('p', 'library-dialog-document', doc.name));
    const memberships = element('fieldset', 'library-memberships'); memberships.append(element('legend', '', 'Collections (choose more than one)'));
    const selected = new Set(doc.collectionIds); const collectionInputs: { collection: Collection; input: HTMLInputElement }[] = [];
    for (const { item, depth } of orderedTree(library.collections)) {
      const choice = check(`${item.name}${item.sourceId ? ' · source-owned' : ''}`, selected.has(item.id)); choice.row.style.paddingInlineStart = `${depth * 12}px`; choice.input.disabled = Boolean(item.sourceId);
      memberships.append(choice.row); collectionInputs.push({ collection: item, input: choice.input });
    }
    if (!collectionInputs.length) memberships.append(element('p', 'library-dialog-help', 'Create a personal collection from the sidebar to organize this item.'));
    const favorite = check('Favorite', doc.favorite); const tags = element('input'); tags.value = doc.tags.join(', '); tags.placeholder = 'Comma-separated personal tags';
    const notes = element('textarea'); notes.rows = 5; notes.value = doc.notes;
    view.content.append(memberships, favorite.row, labeled('Personal tags', tags), labeled('Personal notes', notes), element('p', 'library-dialog-help', 'Indexed folder memberships are read-only. Personal notes, tags, favorites, and collections survive re-indexing. Originals never move.'));
    const sourceDetails = element('details'); sourceDetails.append(element('summary', '', 'Source and original location')); locationActions(doc, sourceDetails, () => view.dialog.close()); view.content.append(sourceDetails);
    const submit = button('Save organization'); submit.type = 'submit'; submit.className = 'primary'; view.actions.append(submit);
    const remove = button('Remove from library…'); remove.className = 'library-remove'; const confirmation = element('div', 'library-remove-confirmation'); confirmation.hidden = true;
    const confirm = button('Remove entry'); confirm.className = 'danger'; const keep = button('Keep reference');
    confirmation.append(element('p', '', 'Remove only this library entry? The original file and saved reading position will not be deleted. Re-indexing its folder may add it again.'), keep, confirm); view.content.append(remove, confirmation);
    remove.onclick = () => { confirmation.hidden = false; confirm.focus(); }; keep.onclick = () => { confirmation.hidden = true; remove.focus(); };
    confirm.onclick = () => void mutate(() => editLibrary({ action: 'removeDocument', path: doc.path }), () => view.dialog.close());
    view.form.onsubmit = event => {
      event.preventDefault(); const current = library.documents.find(item => item.path === doc.path); if (!current) { view.dialog.close(); return; }
      // Keep all source-owned memberships, including ones not shown.
      const ids = new Set(current.collectionIds.filter(id => { const item = library.collections.find(collection => collection.id === id); return !item || Boolean(item.sourceId); }));
      for (const { collection, input } of collectionInputs) if (!collection.sourceId && input.checked) ids.add(collection.id);
      void mutate(() => editLibrary({ action: 'updateDocument', path: doc.path, collectionIds: [...ids], favorite: favorite.input.checked, tags: [...new Set(tags.value.split(',').map(tag => tag.trim()).filter(Boolean))], notes: notes.value }), () => view.dialog.close());
    };
    view.dialog.showModal(); tags.focus();
  }
  function referenceDetails(doc: LibraryDocument, trigger: HTMLElement) {
    const view = openDialog(doc.name, trigger); if (!view) return;
    view.content.append(element('p', 'library-document-meta', `${doc.format.toUpperCase()} · ${doc.availability ?? 'ready'}`));
    if (doc.tags.length) view.content.append(element('p', 'library-dialog-help', `Personal tags: ${doc.tags.join(', ')}`));
    if (doc.notes) view.content.append(element('p', 'library-description', doc.notes));
    locationActions(doc, view.content, () => view.dialog.close());
    const read = button('Open in reader'); read.onclick = () => { view.dialog.close(); void openDocument(doc, trigger); }; view.actions.append(read);
    const edit = button('Organize…'); edit.onclick = () => { view.dialog.close(); organize(doc, trigger); }; view.actions.append(edit); view.dialog.showModal();
  }
  async function openDocument(doc: LibraryDocument, trigger?: HTMLElement, sequence?: string[]) {
    if (busy) return;
    if (isImage(doc) && sequence) imageSequence = sequence;
    setBusy(true); let opened = false;
    try {
      opened = await callbacks.open(doc.path);
      if (opened) { activePath = doc.path; renderImageNavigation(); if (!wide.matches) { setVisible(false, false, false); workspace?.querySelector<HTMLElement>('.reader-host:not(.staging)')?.focus(); } }
    } catch (error) { report(error); }
    finally { setBusy(false); if (!opened) restoreFocus(`open:${doc.path}`, trigger); }
  }
  function renderImageNavigation() {
    const focused = document.activeElement instanceof HTMLElement && imageNavigation.contains(document.activeElement) ? document.activeElement.dataset.imageDirection : undefined;
    imageNavigation.replaceChildren(); const doc = library.documents.find(item => item.path === activePath);
    imageNavigation.hidden = !doc || !isImage(doc); if (!doc || !isImage(doc)) return;
    imageSequence = imageSequence.filter(path => library.documents.some(item => item.path === path && isImage(item)));
    if (!imageSequence.includes(doc.path)) imageSequence = matches.filter(isImage).map(item => item.path);
    if (!imageSequence.includes(doc.path)) imageSequence = [doc.path];
    const index = imageSequence.indexOf(doc.path); const previous = button('←', 'Previous image in collection'); const next = button('→', 'Next image in collection');
    previous.dataset.imageDirection = 'previous'; next.dataset.imageDirection = 'next'; previous.disabled = index <= 0; next.disabled = index >= imageSequence.length - 1;
    const move = (offset: number) => { const target = library.documents.find(item => item.path === imageSequence[index + offset]); if (target) void openDocument(target); };
    previous.onclick = () => move(-1); next.onclick = () => move(1);
    const caption = element('span', '', `${index + 1} / ${imageSequence.length} · ${doc.name}`); caption.title = doc.name;
    imageNavigation.append(previous, caption, next);
    if (busy) setBusy(true);
    if (focused) { const control = imageNavigation.querySelector<HTMLButtonElement>(`[data-image-direction="${focused}"]`); if (control && !control.disabled) control.focus(); }
  }
  function sourceManager(trigger: HTMLElement) {
    const view = openDialog('Sources and originals', trigger); if (!view) return;
    if (desktop) {
      const indexButton = button('Index a folder of PDFs', undefined, 'index-folder'); indexButton.className = 'primary';
      indexButton.onclick = () => void mutate(() => indexFolder(), () => view.dialog.close());
      const row = element('section', 'library-source-card');
      row.append(element('h3', '', 'Folders'), element('p', 'library-dialog-help', 'Choose a folder to list its PDFs, grouped by subfolder. Each entry points at its real file; nothing is copied. Index the same folder again to pick up changes.'), indexButton);
      view.content.append(row);
    } else view.content.append(element('p', 'library-dialog-help', 'Folder indexing and source locations require the desktop app. Browser mode supports locally chosen documents and images.'));
    for (const sourceRoot of library.roots) {
      const row = element('section', 'library-source-card'); row.append(element('h3', '', sourceRoot.name), element('p', 'library-source-path', sourceRoot.path ?? 'Not located'));
      if (desktop && !sourceRoot.managed) { const locate = button('Locate folder…'); locate.onclick = () => void mutate(() => chooseSourceRoot(sourceRoot.id), () => view.dialog.close()); row.append(locate); }
      view.content.append(row);
    }
    view.dialog.showModal();
  }

  function rebuildIndex() {
    searchable = new Map(library.documents.map(doc => [doc.path, searchText(doc)])); collectionMatches = new Map();
    for (const collection of library.collections) {
      if (!knownCollections.has(collection.id)) { knownCollections.add(collection.id); if (!collection.parentId) expanded.add(collection.id); }
      collectionMatches.set(collection.id, new Set(library.documents.filter(doc => doc.collectionIds.includes(collection.id)).map(doc => doc.path)));
    }
    for (const { item } of orderedTree(library.collections).reverse()) {
      if (!item.parentId) continue;
      const parent = collectionMatches.get(item.parentId); if (parent) for (const path of collectionMatches.get(item.id) ?? []) parent.add(path);
    }
  }
  function renderNavigation() {
    navigation.replaceChildren();
    function filterButton(label: string, count: number, next: Filter, key: string) {
      const control = button('', label, key); control.className = 'library-filter'; control.append(element('span', 'library-filter-name', label), element('span', 'library-count', String(count)));
      control.setAttribute('aria-pressed', String(filter.kind === next.kind && (!('id' in next) || 'id' in filter && filter.id === next.id)));
      control.onclick = () => { filter = next; page = 0; render(); restoreFocus(key); }; return control;
    }
    navigation.append(filterButton('All references', library.documents.length, { kind: 'all' }, 'all'), filterButton('Favorites', library.documents.filter(doc => doc.favorite).length, { kind: 'favorites' }, 'favorites'), filterButton('Unfiled', library.documents.filter(doc => !doc.collectionIds.length).length, { kind: 'unfiled' }, 'unfiled'));
    const heading = element('div', 'library-collections-heading'); const create = button('+ New', 'New personal collection', 'new-collection'); create.onclick = () => collectionForm(create); heading.append(element('h3', '', 'Collections'), create); navigation.append(heading);
    const parents = new Set(library.collections.map(item => item.parentId)); const byId = new Map(library.collections.map(item => [item.id, item]));
    for (const { item, depth } of orderedTree(library.collections)) {
      let parent = item.parentId, hidden = false; const seen = new Set<string>();
      while (parent && !seen.has(parent)) { seen.add(parent); if (byId.has(parent) && !expanded.has(parent)) hidden = true; parent = byId.get(parent)?.parentId ?? null; }
      if (hidden) continue;
      const row = element('div', 'library-collection'); row.style.paddingInlineStart = `${Math.min(depth, 8) * 11}px`;
      if (parents.has(item.id)) { const expand = button(expanded.has(item.id) ? '▾' : '▸', `${expanded.has(item.id) ? 'Collapse' : 'Expand'} ${item.name}`, `expand:${item.id}`); expand.className = 'library-expand'; expand.setAttribute('aria-expanded', String(expanded.has(item.id))); expand.onclick = () => { if (expanded.has(item.id)) expanded.delete(item.id); else expanded.add(item.id); renderNavigation(); restoreFocus(`expand:${item.id}`); }; row.append(expand); }
      else row.append(element('span', 'library-expand-spacer'));
      const select = filterButton(`${item.name}${item.removed ? ' · removed' : ''}`, collectionMatches.get(item.id)?.size ?? 0, { kind: 'collection', id: item.id }, `collection:${item.id}`);
      select.title = [item.name, item.sourceId ? 'Indexed folder collection' : 'Personal collection'].join('\n'); row.append(select);
      if (!item.sourceId) { const edit = button('···', `Edit ${item.name}`, `edit:${item.id}`); edit.className = 'library-collection-action'; edit.onclick = () => collectionForm(edit, item); row.append(edit); }
      navigation.append(row);
    }
    if (!library.collections.length) navigation.append(element('p', 'library-no-collections', 'Create a collection or index a folder.'));
    const sources = [...new Set(library.documents.map(doc => doc.source?.repository).filter((source): source is string => Boolean(source)))];
    if (sources.length) { const heading = element('div', 'library-collections-heading'); heading.append(element('h3', '', 'Sources')); navigation.append(heading); for (const source of sources) navigation.append(filterButton(source, library.documents.filter(doc => doc.source?.repository === source).length, { kind: 'source', id: source }, `source:${source}`)); }
  }

  let thumbnailGeneration = 0, thumbnailActive = 0;
  let thumbnailQueue: { image: HTMLImageElement; path: string; generation: number }[] = [];
  const thumbnailUrls = new Set<string>();
  const thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const image = entry.target as HTMLImageElement; thumbnailObserver.unobserve(image);
      thumbnailQueue.push({ image, path: image.dataset.path!, generation: thumbnailGeneration });
    }
    pumpThumbnails();
  }, { root: documents, rootMargin: '120px' });
  function clearThumbnails() {
    ++thumbnailGeneration; thumbnailObserver.disconnect(); thumbnailQueue = [];
    for (const url of thumbnailUrls) URL.revokeObjectURL(url); thumbnailUrls.clear();
    for (const image of documents.querySelectorAll<HTMLImageElement>('img[data-path]')) { image.removeAttribute('src'); image.hidden = true; }
  }
  function observeThumbnails() { if (visible) for (const image of documents.querySelectorAll<HTMLImageElement>('img[data-path]')) if (!image.hasAttribute('src')) thumbnailObserver.observe(image); }
  function pumpThumbnails() {
    while (thumbnailActive < 3 && thumbnailQueue.length) {
      const item = thumbnailQueue.shift()!; if (item.generation !== thumbnailGeneration || !item.image.isConnected || !visible) continue;
      ++thumbnailActive;
      void readLibraryThumbnail(item.path).then(thumbnail => {
        if (!thumbnail || item.generation !== thumbnailGeneration || !item.image.isConnected || !visible) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'].includes(thumbnail.mime)) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(thumbnail.bytes)], { type: thumbnail.mime })); thumbnailUrls.add(url); item.image.src = url; item.image.hidden = false;
      }).catch(() => { if (item.generation === thumbnailGeneration && item.image.isConnected) item.image.parentElement!.title = 'Thumbnail unavailable. Use source details to locate the original.'; }).finally(() => { --thumbnailActive; pumpThumbnails(); });
    }
  }
  window.addEventListener('pagehide', clearThumbnails);
  function renderDocuments() {
    clearThumbnails(); documents.replaceChildren(); pager.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase(); const selected = filter;
    matches = library.documents.filter(doc => {
      if (selected.kind === 'favorites' && !doc.favorite || selected.kind === 'unfiled' && doc.collectionIds.length) return false;
      if (selected.kind === 'collection' && !collectionMatches.get(selected.id)?.has(doc.path)) return false;
      if (selected.kind === 'source' && doc.source?.repository !== selected.id) return false;
      if (format.value === 'image' && !isImage(doc) || format.value === 'document' && !['pdf', 'epub', 'md', 'markdown', 'txt'].includes(doc.format)) return false;
      if (availability.value && (doc.availability ?? 'ready') !== availability.value) return false;
      const categories = doc.collectionIds.map(id => library.collections.find(item => item.id === id)?.name ?? '').join(' ').toLocaleLowerCase();
      return !query || query.split(/\s+/).every(word => `${searchable.get(doc.path) ?? ''} ${categories}`.includes(word));
    });
    matches.sort(sort.value === 'name' ? (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.path.localeCompare(b.path) : (a, b) => timestamp(b.lastOpened) - timestamp(a.lastOpened) || a.name.localeCompare(b.name));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
    resultCount.textContent = `${matches.length} ${matches.length === 1 ? 'reference' : 'references'}`;
    documents.classList.toggle('library-grid', matches.some(isImage));
    if (!matches.length) {
      const empty = element('div', 'library-empty'); empty.setAttribute('role', 'listitem');
      empty.append(element('strong', '', loadError ? 'Library unavailable' : !loaded ? 'Loading library…' : !library.documents.length ? 'Your references, collected.' : 'No matching references'), element('p', '', loadError ? 'Could not load the library. Close and reopen it to retry.' : !loaded ? 'Getting your saved library.' : !library.documents.length ? 'Add local documents and images, or index a folder of PDFs. Originals stay untouched.' : 'Try another search, format, availability, or collection.'));
      documents.append(empty);
    }
    for (const doc of matches.slice(page * pageSize, (page + 1) * pageSize)) {
      const row = element('div', 'library-document'); row.setAttribute('role', 'listitem'); row.classList.toggle('is-active', doc.path === activePath);
      const open = button('', `Open ${doc.name}`, `open:${doc.path}`); open.className = 'library-document-open'; open.title = doc.path; if (doc.path === activePath) open.setAttribute('aria-current', 'true');
      if (isImage(doc)) { const preview = element('span', 'library-thumbnail'); preview.append(element('span', 'library-thumbnail-placeholder', doc.format.toUpperCase())); const image = element('img'); image.alt = ''; image.hidden = true; image.decoding = 'async'; image.dataset.path = doc.path; preview.append(image); open.append(preview); }
      open.append(element('span', 'library-document-name', doc.name), element('span', 'library-document-meta', `${doc.format.toUpperCase()} · ${doc.source?.removed ? 'no longer in folder' : doc.availability ?? 'ready'}${doc.path === activePath ? ' · Reading' : ''}`));
      open.onclick = () => void openDocument(doc, open, matches.filter(isImage).map(item => item.path));
      const actions = element('div', 'library-card-actions');
      const favorite = button(doc.favorite ? '★' : '☆', `${doc.favorite ? 'Unfavorite' : 'Favorite'} ${doc.name}`, `favorite:${doc.path}`); favorite.className = 'library-favorite'; favorite.setAttribute('aria-pressed', String(doc.favorite));
      favorite.onclick = () => void mutate(() => editLibrary({ action: 'updateDocument', path: doc.path, collectionIds: doc.collectionIds, favorite: !doc.favorite, tags: doc.tags, notes: doc.notes }));
      const details = button('Info', `Reference details for ${doc.name}`, `details:${doc.path}`); details.className = 'library-info'; details.onclick = () => referenceDetails(doc, details);
      const organizeButton = button('···', `Organize ${doc.name}`, `organize:${doc.path}`); organizeButton.className = 'library-organize'; organizeButton.onclick = () => organize(doc, organizeButton);
      actions.append(favorite, details, organizeButton); row.append(open, actions); documents.append(row);
    }
    if (matches.length > pageSize) {
      const previous = button('←', 'Previous library page', 'page-previous'); previous.disabled = page === 0; const next = button('→', 'Next library page', 'page-next'); next.disabled = (page + 1) * pageSize >= matches.length;
      const change = (offset: number) => { page += offset; renderDocuments(); documents.scrollTop = 0; documents.querySelector<HTMLElement>('.library-document-open')?.focus(); };
      previous.onclick = () => change(-1); next.onclick = () => change(1); pager.append(previous, element('span', '', `${page * pageSize + 1}–${Math.min(matches.length, (page + 1) * pageSize)} / ${matches.length}`), next);
    }
    observeThumbnails(); renderImageNavigation(); if (busy) setBusy(true);
  }
  function render() {
    const key = focusKey(); if (filter.kind === 'collection' && !library.collections.some(collection => filter.kind === 'collection' && collection.id === filter.id)) filter = { kind: 'unfiled' };
    renderNavigation(); renderDocuments(); const collection = filter.kind === 'collection' ? library.collections.find(item => filter.kind === 'collection' && item.id === filter.id) : undefined;
    add.title = collection && !collection.sourceId ? `Add files to ${collection.name}` : 'Add files to Unfiled';
    if (busy) setBusy(true); if (key && !busy && !modal?.open) restoreFocus(key);
  }
  search.oninput = () => { page = 0; renderDocuments(); }; sort.onchange = format.onchange = availability.onchange = () => { page = 0; renderDocuments(); };
  let chosenCollection: string | null = null;
  add.onclick = () => { if (busy) return; const collection = filter.kind === 'collection' ? library.collections.find(item => filter.kind === 'collection' && item.id === filter.id) : undefined; chosenCollection = collection && !collection.sourceId ? collection.id : null; if (desktop) void mutate(() => addDocuments(chosenCollection)); else fileInput.click(); };
  fileInput.onchange = () => { const files = Array.from(fileInput.files ?? []); fileInput.value = ''; if (files.length) void mutate(() => addDocuments(chosenCollection, files)); };
  sourcesButton.onclick = () => sourceManager(sourcesButton);
  async function refresh(path?: string) {
    if (path !== undefined) activePath = path; const token = ++revision;
    try { const next = await getLibrary(); if (token !== revision) return; library = next; loaded = true; loadError = false; rebuildIndex(); render(); }
    catch (error) { if (token !== revision) return; loadError = true; render(); callbacks.error(error); }
  }
  toggleButton?.setAttribute('aria-controls', root.id); applySide(); applyWidth(preferredWidth); rebuildIndex(); applyVisibility(); render();
  return { refresh, toggle: () => { toggle(); if (visible && loadError) void refresh(); } };
}
