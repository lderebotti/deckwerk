import type { SystemTheme } from '@shared/systemTheme.js';

/**
 * Paint the app chrome in the desktop's Omarchy theme. The slide content keeps
 * its own `theme.css`; only the custom properties the chrome reads are set.
 */
export function applySystemTheme(theme: SystemTheme | null): void {
  if (!theme) return;
  const root = document.documentElement;
  for (const [property, value] of Object.entries(theme.vars)) {
    root.style.setProperty(property, value);
  }
  root.dataset['chromeTheme'] = theme.mode;
}

/** Apply the theme now (before first paint) and follow later switches. */
export function installSystemTheme(): void {
  // The browser collaboration client has no preload bridge and no desktop
  // theme; it keeps the built-in chrome colours.
  if (typeof window.api?.getSystemTheme !== 'function') return;
  applySystemTheme(window.api.getSystemTheme());
  window.api.onSystemTheme(applySystemTheme);
}
