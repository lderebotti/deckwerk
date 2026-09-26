import { describe, expect, it } from 'vitest';
import { parseColorsToml, resolveMode, systemTheme } from '../src/shared/systemTheme.js';

const OMARCHY_LIGHT = `
mode = "light"

accent = "#6e6e6e"
background = "#ffffff"
foreground = "#000000"
muted = "#808080"
red = "#2a2a2a"
`;

describe('the Omarchy theme adapter', () => {
  it('parses quoted and bare values, ignoring comments and blank lines', () => {
    const colors = parseColorsToml(`
      # a comment
      mode = "dark"
      accent=#89b4fa
      background = "#1e1e2e" # trailing
      empty =
    `);
    expect(colors).toEqual({
      mode: 'dark',
      accent: '#89b4fa',
      background: '#1e1e2e',
      empty: '',
    });
  });

  it('resolves the mode from the key, a light marker, or the background luminance', () => {
    expect(resolveMode({ mode: 'light' })).toBe('light');
    expect(resolveMode({ theme_type: 'dark' })).toBe('dark');
    expect(resolveMode({}, true)).toBe('light');
    expect(resolveMode({ background: '#ffffff' })).toBe('light');
    expect(resolveMode({ background: '#1e1e2e' })).toBe('dark');
    expect(resolveMode({})).toBe('dark');
  });

  it('maps a light palette onto the chrome custom properties', () => {
    const theme = systemTheme(parseColorsToml(OMARCHY_LIGHT));
    expect(theme.mode).toBe('light');
    expect(theme.vars['--bg']).toBe('#ffffff');
    expect(theme.vars['--text']).toBe('#000000');
    expect(theme.vars['--accent']).toBe('#6e6e6e');
    expect(theme.vars['--danger']).toBe('#2a2a2a');
    expect(theme.vars['color-scheme']).toBe('light');
    // Surfaces and borders adapt through color-mix rather than hard-coded darks.
    expect(theme.vars['--panel']).toContain('color-mix');
    expect(theme.vars['--line']).toContain('color-mix');
  });

  it('rejects hex values of a length no colour syntax has', () => {
    expect(systemTheme({ background: '#12345', mode: 'dark' }).vars['--bg']).toBe('#16161e');
    expect(systemTheme({ background: '#1234567', mode: 'dark' }).vars['--bg']).toBe('#16161e');
    expect(systemTheme({ background: '#12345678', mode: 'dark' }).vars['--bg']).toBe('#12345678');
  });

  it('falls back to sensible colours when a theme omits the semantic names', () => {
    const theme = systemTheme({ color0: '#1e1e2e', color7: '#cdd6f4', color4: '#89b4fa' });
    expect(theme.mode).toBe('dark');
    expect(theme.vars['--bg']).toBe('#1e1e2e');
    expect(theme.vars['--text']).toBe('#cdd6f4');
    expect(theme.vars['--accent']).toBe('#89b4fa');
  });
});
