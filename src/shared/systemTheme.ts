/**
 * Omarchy theme integration.
 *
 * Omarchy (the Arch/Hyprland setup) publishes the active theme's palette as a
 * flat `colors.toml` under `~/.local/state/omarchy/current/theme/`. This module
 * turns that palette into the CSS custom properties the DeckWerk chrome already
 * reads, so the app follows the desktop theme. It is pure string work: the main
 * process reads the file, the renderer applies the result.
 *
 * The mapping mirrors Omarchy's own VS Code theme — one ground colour, borders
 * and hover surfaces blended from text and background with `color-mix`, and the
 * accent reserved for focus/selection — rather than inventing a second palette.
 */

export type ThemeMode = 'light' | 'dark';

export interface SystemTheme {
  mode: ThemeMode;
  /** Custom properties to set on the document root. */
  vars: Record<string, string>;
}

/**
 * Parse an Omarchy `colors.toml`. Values are `key = value` with optional
 * single/double quotes (and an optional trailing comment); everything else is
 * ignored, matching omarchy-theme-color.
 */
export function parseColorsToml(text: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/["' ]/g, '');
    if (!key) continue;
    const value = line.slice(eq + 1).trim();
    const quoted = value.match(/^["']([^"']*)["']/);
    colors[key] = quoted ? quoted[1] : value;
  }
  return colors;
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function firstColor(...values: (string | undefined)[]): string | null {
  for (const value of values) if (value && HEX.test(value.trim())) return value.trim();
  return null;
}

/**
 * The theme's mode. Mirrors omarchy-theme-color: an explicit `mode` (or legacy
 * `theme_type`) wins, then a `light.mode` marker file, then the background's
 * luminance, defaulting to dark.
 */
export function resolveMode(colors: Record<string, string>, lightMarker = false): ThemeMode {
  const declared = (colors['mode'] ?? colors['theme_type'] ?? '').trim().toLowerCase();
  if (declared === 'light' || declared === 'dark') return declared;
  if (lightMarker) return 'light';
  const hex = firstColor(colors['background'], colors['bg'], colors['color0']);
  if (hex && hex.length === 7) {
    const n = parseInt(hex.slice(1), 16);
    if (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) > 382) return 'light';
  }
  return 'dark';
}

/**
 * Map a palette to the chrome's custom properties. Surfaces and borders are
 * left as `color-mix` expressions so one injected ground/accent adapts in both
 * modes, exactly as Omarchy's generated editor theme does.
 */
export function systemTheme(colors: Record<string, string>, lightMarker = false): SystemTheme {
  const mode = resolveMode(colors, lightMarker);
  const dark = mode === 'dark';
  const bg = firstColor(colors['background'], colors['bg'], colors['color0']) ?? (dark ? '#16161e' : '#ffffff');
  const fg = firstColor(colors['foreground'], colors['fg'], colors['color7']) ?? (dark ? '#c0caf5' : '#000000');
  const accent = firstColor(colors['accent'], colors['blue'], colors['color4']) ?? (dark ? '#7aa2f7' : '#3b82f6');
  const muted = firstColor(colors['muted'], colors['color8']) ?? 'color-mix(in srgb, var(--bg) 45%, var(--text))';
  const danger = firstColor(colors['red'], colors['bright_red'], colors['color1']) ?? (dark ? '#f7768e' : '#c0392b');
  const green = firstColor(colors['green'], colors['bright_green'], colors['color2']) ?? (dark ? '#9ece6a' : '#2e7d32');
  const yellow = firstColor(colors['yellow'], colors['bright_yellow'], colors['color3']) ?? (dark ? '#e0af68' : '#a86d00');
  const orange = firstColor(colors['orange'], colors['yellow'], colors['color3']) ?? (dark ? '#f59e0b' : '#b45309');

  return {
    mode,
    vars: {
      '--bg': bg,
      '--text': fg,
      '--panel': `color-mix(in srgb, var(--bg) ${dark ? 95 : 96}%, var(--text))`,
      '--panel-2': `color-mix(in srgb, var(--bg) ${dark ? 90 : 92}%, var(--text))`,
      '--line': 'color-mix(in srgb, var(--bg) 84%, var(--text))',
      '--muted': muted,
      '--accent': accent,
      '--accent-soft': 'color-mix(in srgb, var(--accent) 14%, transparent)',
      '--danger': danger,
      '--green': green,
      '--yellow': yellow,
      '--build-orange': orange,
      '--canvas': `color-mix(in srgb, var(--bg) ${dark ? 55 : 94}%, #000)`,
      '--shadow': dark ? '0 1px 2px rgb(0 0 0 / 40%)' : '0 1px 2px rgb(0 0 0 / 12%)',
      'color-scheme': mode,
    },
  };
}
