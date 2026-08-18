import { el } from './components';

export type Theme = 'system' | 'light' | 'dark';

/** Kept in sync with the inline pre-paint script in index.html. */
export const THEME_KEY = 'fortinate:theme';

function isTheme(value: string | null): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Stored preference, defaulting to following the operating system. */
export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    // Private-mode or blocked storage — fall back to the system setting.
    return 'system';
  }
}

/**
 * Apply a theme. 'system' clears the attribute so the
 * `prefers-color-scheme` media query takes over again.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Preference just won't persist across reloads.
  }
}

/** Header control for switching between system, light, and dark. */
export function themePicker(): HTMLElement {
  const wrap = el('div', 'theme-picker');
  const id = 'theme-select';

  const label = el('label', undefined, 'Theme');
  label.htmlFor = id;

  const select = el('select');
  select.id = id;
  for (const [value, text] of [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ] as const) {
    const option = el('option', undefined, text);
    option.value = value;
    select.append(option);
  }
  select.value = loadTheme();
  select.addEventListener('change', () => applyTheme(select.value as Theme));

  wrap.append(label, select);
  return wrap;
}
