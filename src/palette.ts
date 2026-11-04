import { groupCommands, searchCommands, unavailableReason, type Command } from './commands';

/**
 * A keyboard-first palette over the command catalog.
 *
 * The listbox is driven by `aria-activedescendant` rather than moving DOM focus, so the
 * text field keeps focus (and typing) while arrow keys move the highlight. Every row is a
 * real element with an id so screen readers announce the active option.
 *
 * Availability is evaluated at render time: a command that needs a document stays visible
 * but disabled, with the reason as its description, which is why the empty document case
 * teaches rather than hides.
 */

export type PaletteContext = {
  hasDocument: () => boolean;
  desktop: boolean;
  /** Runs a command by id. Errors are the caller's to report. */
  run: (id: string) => void | Promise<void>;
};

export type Palette = {
  /** The dialog element, to be appended to the document once. */
  element: HTMLDialogElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

const MAX_ROWS = 60;

export function createPalette(context: PaletteContext): Palette {
  const dialog = document.createElement('dialog');
  dialog.id = 'palette';
  dialog.className = 'palette';
  dialog.setAttribute('aria-label', 'Command palette');
  dialog.innerHTML = `
    <div class="palette-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="palette-input" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="palette-list" aria-label="Search commands" spellcheck="false" autocomplete="off" placeholder="Type a command…">
      <kbd class="palette-esc">Esc</kbd>
    </div>
    <div id="palette-list" class="palette-list" role="listbox" aria-label="Matching commands"></div>
    <p id="palette-empty" class="palette-empty" hidden>No matching command.</p>`;

  const input = dialog.querySelector<HTMLInputElement>('#palette-input')!;
  const list = dialog.querySelector<HTMLElement>('#palette-list')!;
  const empty = dialog.querySelector<HTMLElement>('#palette-empty')!;

  let rows: Command[] = [];
  let enabled: boolean[] = [];
  let actived = 0;

  function render(query: string): void {
    rows = searchCommands(query).slice(0, MAX_ROWS);
    enabled = rows.map(command => !unavailableReason(command, { hasDocument: context.hasDocument(), desktop: context.desktop }));
    // Prefer selecting the first usable row so Enter does something sensible straight away;
    // when every match is disabled, the first row still describes the intent best.
    const firstEnabled = enabled.findIndex(Boolean);
    actived = firstEnabled === -1 ? 0 : firstEnabled;
    list.replaceChildren();
    empty.hidden = rows.length > 0;

    if (rows.length) {
      // Headings help when browsing an unfiltered list, but while searching they would fight
      // the ranking (a weak "Navigate" hit would sit above the best "View" hit), so a query
      // shows one flat relevance-ordered list.
      const grouped = query.trim() ? [{ group: undefined, commands: rows }] : groupCommands(rows);
      let index = 0;
      for (const section of grouped) {
        if (section.group) {
          const heading = document.createElement('div');
          heading.className = 'palette-group';
          heading.id = `palette-group-${section.group.toLowerCase()}`;
          heading.setAttribute('role', 'presentation');
          heading.textContent = section.group;
          list.append(heading);
        }
        const group = document.createElement('div');
        group.setAttribute('role', 'group');
        if (section.group) group.setAttribute('aria-labelledby', `palette-group-${section.group.toLowerCase()}`);
        for (const command of section.commands) {
          const position = index++;
          const available = enabled[position];
          const reason = unavailableReason(command, { hasDocument: context.hasDocument(), desktop: context.desktop });
          const row = document.createElement('div');
          row.id = `palette-row-${position}`;
          row.className = 'palette-row';
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', 'false');
          row.setAttribute('aria-disabled', String(!available));
          row.dataset.index = String(position);
          if (reason) row.title = reason;
          const name = document.createElement('span');
          name.className = 'palette-label';
          name.textContent = command.label;
          row.append(name);
          if (command.shortcut) {
            const keys = document.createElement('kbd');
            keys.textContent = command.shortcut;
            row.append(keys);
          }
          // A disabled row explains itself rather than just going grey, so the shortcut is
          // still shown but the reason follows it.
          if (reason) {
            const note = document.createElement('span');
            note.className = 'palette-hint';
            note.textContent = reason;
            row.append(note);
          }
          group.append(row);
        }
        list.append(group);
      }
    }
    highlight(actived);
  }

  function highlight(next: number): void {
    const elements = list.querySelectorAll<HTMLElement>('.palette-row');
    if (!elements.length) { input.removeAttribute('aria-activedescendant'); return; }
    actived = Math.max(0, Math.min(elements.length - 1, next));
    elements.forEach((element, index) => element.setAttribute('aria-selected', String(index === actived)));
    input.setAttribute('aria-activedescendant', elements[actived].id);
    elements[actived].scrollIntoView({ block: 'nearest' });
  }

  /** Moves the highlight by `step`, skipping disabled rows and wrapping. */
  function step(delta: number): void {
    if (!enabled.length) return;
    let next = actived;
    for (let tried = 0; tried < enabled.length; tried++) {
      next = (next + delta + enabled.length) % enabled.length;
      if (enabled[next]) break;
    }
    highlight(next);
  }

  function choose(index: number): void {
    const command = rows[index];
    if (!command || !enabled[index]) return;
    close();
    void Promise.resolve(context.run(command.id)).catch(() => {});
  }

  function close(): void {
    if (dialog.open) dialog.close();
    input.value = '';
  }

  input.addEventListener('input', () => render(input.value));

  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); step(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); step(-1); }
    else if (event.key === 'Home' && !input.value) { event.preventDefault(); highlight(0); }
    else if (event.key === 'End' && !input.value) { event.preventDefault(); highlight(rows.length - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(actived); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
  });

  // Pointer selection; mousedown is prevented on the list so the input keeps focus.
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const row = (event.target as Element).closest<HTMLElement>('.palette-row');
    if (row) choose(Number(row.dataset.index));
  });
  list.addEventListener('mousemove', event => {
    const row = (event.target as Element).closest<HTMLElement>('.palette-row');
    if (row && Number(row.dataset.index) !== actived) highlight(Number(row.dataset.index));
  });

  // Clicking the backdrop (outside the dialog box) dismisses.
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });

  return {
    element: dialog,
    open: () => {
      if (dialog.open) return;
      input.value = '';
      render('');
      dialog.showModal();
      input.focus();
    },
    close,
    isOpen: () => dialog.open,
  };
}
