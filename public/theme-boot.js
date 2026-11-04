// Applies the saved appearance before first paint, so a dark or custom theme never flashes.
// src/theme.ts owns this record's format and re-applies it (with validation) once the app loads.
(() => {
  const root = document.documentElement;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('hold-my-brief:appearance') || '{}') || {}; } catch { /* Defaults apply. */ }
  const mode = saved.mode === 'light' || saved.mode === 'dark' ? saved.mode : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = mode;
  if (typeof saved.palette === 'string') root.dataset.palette = saved.palette;
  if (typeof saved.page === 'string' && saved.page !== 'theme') root.dataset.page = saved.page;
  for (const [name, value] of Object.entries(saved.vars || {})) if (name.startsWith('--accent')) root.style.setProperty(name, String(value));
})();
