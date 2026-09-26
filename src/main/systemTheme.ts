import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseColorsToml, systemTheme, type SystemTheme } from '@shared/systemTheme.js';

/**
 * Reads the active Omarchy theme from disk and keeps a watcher on it, so the
 * chrome follows a theme switch without a restart. The file work lives in the
 * main process; renderers only receive the mapped custom properties
 * (`@shared/systemTheme`).
 *
 * On a machine without Omarchy the palette is simply absent and the app keeps
 * its own built-in chrome colours.
 */

const HEADLESS_TEST = process.env['DECKWERK_HEADLESS_TEST'] === '1';

function stateHome(): string {
  return process.env['XDG_STATE_HOME'] || join(homedir(), '.local', 'state');
}

/** `~/.local/state/omarchy/current` — the stable path the `theme` symlink lives under. */
function currentDir(): string {
  return join(stateHome(), 'omarchy', 'current');
}

export function readSystemTheme(): SystemTheme | null {
  const themeDir = join(currentDir(), 'theme');
  const colorsFile = join(themeDir, 'colors.toml');
  if (!existsSync(colorsFile)) return null;
  try {
    const colors = parseColorsToml(readFileSync(colorsFile, 'utf8'));
    return systemTheme(colors, existsSync(join(themeDir, 'light.mode')));
  } catch {
    return null;
  }
}

let current: SystemTheme | null = null;
let watcher: FSWatcher | null = null;
let debounce: NodeJS.Timeout | null = null;

/** The palette as last read, for synchronous hand-off during preload. */
export function currentSystemTheme(): SystemTheme | null {
  return current;
}

/**
 * Load the palette now and re-read it whenever the current theme changes.
 * `onChange` fires on later changes only; the initial read is returned by
 * `currentSystemTheme()` so the first window paints the right colours.
 */
export function startSystemThemeWatch(onChange: (theme: SystemTheme | null) => void): void {
  if (HEADLESS_TEST || watcher) return;
  current = readSystemTheme();
  const dir = currentDir();
  if (!existsSync(dir)) return;
  try {
    watcher = watch(dir, { persistent: false }, () => {
      if (debounce) clearTimeout(debounce);
      // A theme switch replaces the `theme` symlink in several steps; settle
      // before reading so we never pick up a half-written target.
      debounce = setTimeout(() => {
        debounce = null;
        const next = readSystemTheme();
        const changed = JSON.stringify(next) !== JSON.stringify(current);
        current = next;
        if (changed) onChange(next);
      }, 200);
    });
    watcher.on('error', () => {
      if (debounce) clearTimeout(debounce);
      debounce = null;
      watcher = null;
    });
  } catch {
    // A directory we cannot watch is not fatal: the startup read still applies.
  }
}
