const plugin = 'dsh-better-display';
const styles = new Map<string, string>();

/** Retain injected CSS across host cleanup and restore it before Reader paints. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  const live = new Set<string>();
  for (const tag of document.querySelectorAll<HTMLStyleElement>(`style[data-plugin="${plugin}"][data-plugin-css]`)) {
    const id = tag.dataset.pluginCss;
    if (id === undefined) continue;
    styles.set(id, tag.textContent ?? '');
    live.add(id);
  }
  for (const [id, text] of styles) {
    if (live.has(id)) continue;
    const tag = document.createElement('style');
    tag.dataset.plugin = plugin;
    tag.dataset.pluginCss = id;
    tag.textContent = text;
    document.head.appendChild(tag);
  }
}
