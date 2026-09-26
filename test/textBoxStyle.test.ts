// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ElementSchema, type TextEl } from '../src/shared/deck.js';
import { setTextBoxStyle, textBoxStyle } from '../src/renderer/editor/textFormatting.js';

const text = (style: Record<string, string> = {}): TextEl => ElementSchema.parse({
  id: 't', type: 'text', x: 0, y: 0, w: 400, h: 100, html: 'Label', style,
}) as TextEl;

describe('text box frame', () => {
  it('reads an imported shorthand and rewrites it as longhands', () => {
    const el = text({ border: '3px solid rgb(10, 20, 30)', background: 'rgb(1, 2, 3)', color: 'red' });
    expect(textBoxStyle(el)).toMatchObject({ fill: 'rgb(1, 2, 3)', borderWidth: 3, borderColor: 'rgb(10, 20, 30)' });
    setTextBoxStyle(el, { radius: 12, padding: 16 });
    expect(el.style).toEqual({
      color: 'red',
      'background-color': 'rgb(1, 2, 3)',
      'border-style': 'solid', 'border-width': '3px', 'border-color': 'rgb(10, 20, 30)',
      'border-radius': '12px', padding: '16px',
    });
  });

  it('clearing everything leaves no frame declarations behind', () => {
    const el = text({ 'background-color': '#fff', border: '2px solid #000', 'border-radius': '8px' });
    setTextBoxStyle(el, { fill: null, borderWidth: 0, radius: 0, padding: 0 });
    expect(el.style).toEqual({});
    expect(textBoxStyle(el)).toEqual({ fill: null, borderColor: null, borderWidth: 0, radius: 0, padding: 0 });
  });

  it('keeps a gradient background while changing the fill colour', () => {
    const el = text({ background: 'linear-gradient(red, blue)' });
    setTextBoxStyle(el, { fill: '#123456' });
    expect(el.style.background).toBe('linear-gradient(red, blue)');
    expect(el.style['background-color']).toBe('#123456');
  });
});
