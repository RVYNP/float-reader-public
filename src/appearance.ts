import { appearance, applyAppearance, palettes, readingColors, rgbToHex, saveAppearance, type Appearance, type AppearanceMode, type PageTone, type Palette } from './theme';

const icon = (size: number, body: string) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const paletteIcon = icon(14, '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>');
const names: Record<Palette, string> = { brief: 'Brief', lilac: 'Lilac', birch: 'Birch', graphite: 'Graphite', arctic: 'Arctic' };
const modes: [AppearanceMode, string, string][] = [
  ['system', 'System', icon(13, '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>')],
  ['light', 'Light', icon(13, '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>')],
  ['dark', 'Dark', icon(13, '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')],
];
/** Accent presets offered beside the theme's own accent; any other color is a custom accent. */
const presets: [string, string][] = [['Acid', '#e13a3a'], ['Iris', '#a86af4'], ['Blue', '#3d6fff'], ['Teal', '#2b8a84'], ['Rose', '#c2456b'], ['Moss', '#5f8a3a'], ['Amber', '#c27a1a']];
const tones: [PageTone, string][] = [['theme', 'Match theme'], ['white', 'White'], ['sepia', 'Sepia'], ['dim', 'Dim']];
const restingHint = 'Hover a theme to try it on the whole window. Click to keep it.';

/** Menu label for the kept appearance, e.g. "Lilac · System". */
export function appearanceSummary() {
  const kept = appearance();
  return `${names[kept.palette]} · ${modes.find(([mode]) => mode === kept.mode)![1]}`;
}

/** Radio group with a roving tab stop: arrows move focus, and `selectOnFocus` groups also choose. */
function radioGroup(group: HTMLElement, selectOnFocus: boolean) {
  group.addEventListener('keydown', event => {
    const items = Array.from(group.querySelectorAll<HTMLButtonElement>('[role=radio]'));
    const index = items.indexOf(event.target as HTMLButtonElement), step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (index < 0 || !step) return;
    event.preventDefault();
    const next = items[(index + step + items.length) % items.length];
    next.focus(); if (selectOnFocus) next.click();
  });
}
function check(group: HTMLElement, chosen: (item: HTMLElement) => boolean) {
  const items = Array.from(group.querySelectorAll<HTMLElement>('[role=radio]'));
  const selected = items.find(chosen);
  for (const item of items) { item.setAttribute('aria-checked', String(item === selected)); item.tabIndex = item === (selected ?? items[0]) ? 0 : -1; }
}

/**
 * Fills the Appearance bottom sheet. Hovering or focusing a theme previews it on the whole
 * window; click or Enter keeps it; leaving the cards, blur or Escape restores the kept theme.
 */
export function createAppearanceSheet(dialog: HTMLDialogElement) {
  dialog.setAttribute('aria-labelledby', 'appearance-title');
  dialog.innerHTML = `
    <div class="sheet-head"><h2 id="appearance-title">Appearance</h2><button class="sheet-close" data-close aria-label="Close appearance">${icon(15, '<path d="M18 6 6 18M6 6l12 12"/>')}</button></div>
    <p class="appearance-hint" aria-live="polite">${restingHint}</p>
    <div class="segmented appearance-modes" role="radiogroup" aria-label="Mode">${modes.map(([mode, label, glyph]) => `<button role="radio" data-mode="${mode}">${glyph}${label}</button>`).join('')}</div>
    <div class="theme-group"><span class="sheet-label" id="appearance-theme-label">THEME</span>
      <div class="theme-row" role="radiogroup" aria-labelledby="appearance-theme-label">${palettes.map(palette => `<button class="theme-card" role="radio" data-choice="${palette}"><span class="theme-tile" data-palette="${palette}"><span class="theme-sample">Aa</span><span class="theme-dots" aria-hidden="true"><span></span><span></span><span></span><span></span></span></span><span class="theme-name">${names[palette]}</span></button>`).join('')}</div></div>
    <div class="appearance-row"><span class="sheet-label" id="appearance-accent-label">ACCENT</span>
      <div class="swatches" role="radiogroup" aria-labelledby="appearance-accent-label">
        <button class="swatch swatch-theme" role="radio" data-accent="" aria-label="Theme accent"><span></span></button>
        ${presets.map(([name, color]) => `<button class="swatch" role="radio" data-accent="${color}" aria-label="${name}" style="--swatch: ${color}"><span></span></button>`).join('')}
        <button class="swatch swatch-custom" role="radio" aria-label="Custom accent color…"><span></span>${icon(12, '<path d="M5 12h14M12 5v14"/>')}</button>
        <input class="swatch-input" type="color" tabindex="-1" aria-hidden="true">
      </div></div>
    <div class="appearance-row"><span class="sheet-label" id="appearance-page-label">PAGE</span>
      <div class="segmented" role="radiogroup" aria-labelledby="appearance-page-label">${tones.map(([tone, label]) => `<button role="radio" data-tone="${tone}">${label}</button>`).join('')}</div></div>
    <p class="appearance-note">PDF pages and images keep their original colors.</p>`;
  const hint = dialog.querySelector<HTMLElement>('.appearance-hint')!;
  const modeGroup = dialog.querySelector<HTMLElement>('.appearance-modes')!, themeRow = dialog.querySelector<HTMLElement>('.theme-row')!;
  const swatches = dialog.querySelector<HTMLElement>('.swatches')!, themeSwatch = dialog.querySelector<HTMLElement>('.swatch-theme')!;
  const custom = dialog.querySelector<HTMLButtonElement>('.swatch-custom')!, picker = dialog.querySelector<HTMLInputElement>('.swatch-input')!;
  const toneGroup = dialog.querySelector<HTMLElement>('[aria-labelledby=appearance-page-label]')!;
  let kept: Appearance = appearance();

  function render() {
    const shown = appearance(), previewing = shown.palette !== kept.palette;
    check(modeGroup, item => item.dataset.mode === kept.mode);
    check(themeRow, item => item.dataset.choice === kept.palette);
    for (const card of themeRow.querySelectorAll<HTMLElement>('.theme-card')) card.toggleAttribute('data-previewing', previewing && card.dataset.choice === shown.palette);
    const preset = kept.accent === null || presets.some(([, color]) => color === kept.accent);
    check(swatches, item => item === custom ? !preset : item.dataset.accent === (kept.accent ?? ''));
    themeSwatch.dataset.palette = shown.palette;
    custom.style.setProperty('--swatch', kept.accent ?? 'transparent');
    custom.setAttribute('aria-label', preset ? 'Custom accent color…' : `Custom accent ${kept.accent}`);
    check(toneGroup, item => item.dataset.tone === kept.page);
    hint.toggleAttribute('data-previewing', previewing);
    hint.textContent = previewing ? `Previewing ${names[shown.palette]}. Click to keep it, or move away to return to ${names[kept.palette]}.` : restingHint;
  }
  function keep(change: Partial<Appearance>) { kept = { ...kept, ...change }; saveAppearance(kept); render(); }
  function preview(palette: Palette) {
    if (palette === kept.palette) restore();
    else if (appearance().palette !== palette) { applyAppearance({ ...kept, palette }); render(); }
  }
  function restore() { if (appearance() !== kept) { applyAppearance(kept); render(); } }

  for (const group of [modeGroup, swatches, toneGroup]) radioGroup(group, true);
  radioGroup(themeRow, false);
  modeGroup.addEventListener('click', event => { const mode = (event.target as Element).closest<HTMLElement>('[data-mode]')?.dataset.mode as AppearanceMode | undefined; if (mode) keep({ mode }); });
  toneGroup.addEventListener('click', event => { const page = (event.target as Element).closest<HTMLElement>('[data-tone]')?.dataset.tone as PageTone | undefined; if (page) keep({ page }); });
  themeRow.addEventListener('click', event => { const palette = (event.target as Element).closest<HTMLElement>('[data-choice]')?.dataset.choice as Palette | undefined; if (palette) keep({ palette }); });
  for (const card of themeRow.querySelectorAll<HTMLElement>('.theme-card')) {
    const palette = card.dataset.choice as Palette;
    card.addEventListener('pointerenter', () => preview(palette));
    card.addEventListener('focus', () => preview(palette));
  }
  themeRow.addEventListener('pointerleave', restore);
  themeRow.addEventListener('focusout', event => { if (!themeRow.contains(event.relatedTarget as Node | null)) restore(); });
  swatches.addEventListener('click', event => {
    const swatch = (event.target as Element).closest<HTMLElement>('[role=radio]');
    if (!swatch) return;
    if (swatch !== custom) { keep({ accent: swatch.dataset.accent || null }); return; }
    picker.value = kept.accent ?? rgbToHex(readingColors().accent);
    try { picker.showPicker(); } catch { picker.click(); }
  });
  picker.addEventListener('change', () => keep({ accent: picker.value.toLowerCase() }));
  dialog.addEventListener('keydown', event => {
    // The first Escape only ends a preview; the next one closes the sheet.
    if (event.key === 'Escape' && appearance() !== kept) { event.preventDefault(); event.stopPropagation(); restore(); }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientY < box.top || event.clientX < box.left || event.clientX > box.right) dialog.close();
  });
  dialog.addEventListener('close', restore);

  return {
    open() { kept = appearance(); render(); dialog.showModal(); modeGroup.querySelector<HTMLElement>('[aria-checked=true]')?.focus(); },
  };
}
