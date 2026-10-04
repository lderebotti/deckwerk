import { describe, expect, it } from 'vitest';
import { ElementSchema, type SlideElement } from '../src/shared/deck.js';
import { applyFormat, copyFormat } from '../src/shared/formatPainter.js';

const element = (raw: Record<string, unknown>): SlideElement => ElementSchema.parse({
  x: 10, y: 20, w: 300, h: 100, ...raw,
});

describe('format painter', () => {
  it('gives text the source box type and drops the target runs that would outrank it', () => {
    const source = element({
      id: 'a', type: 'text', html: 'Source', class: ['role-heading'], align: 'center', valign: 'middle',
      style: { color: 'rgb(255, 0, 0)', 'font-weight': '700' }, overrides: ['color', 'font-weight'],
      paragraphSpacing: 12, opacity: 0.5,
    });
    const target = element({
      id: 'b', type: 'text', html: '<span style="font-size: 40px; color: blue">Target</span>',
      class: ['role-body', 'placeholder'], style: { 'font-style': 'italic' }, overrides: ['font-style'],
    });

    applyFormat(target, copyFormat(source));

    expect(target).toMatchObject({
      id: 'b', x: 10, y: 20, w: 300, h: 100,
      align: 'center', valign: 'middle', paragraphSpacing: 12, opacity: 0.5,
      style: { color: 'rgb(255, 0, 0)', 'font-weight': '700' },
      overrides: ['color', 'font-weight'],
    });
    expect(target.type === 'text' && target.html).not.toMatch(/font-size|color/);
    expect(target.type === 'text' && target.html).toContain('Target');
    // The role travels; the prompt marker is the target's own.
    expect(target.class.sort()).toEqual(['placeholder', 'role-heading']);
  });

  it('leaves a table its cell formatting', () => {
    const table = element({
      id: 't', type: 'text', table: { columnWidths: [1] },
      html: '<table><tr><td style="font-size: 18px">1</td></tr></table>',
    });
    applyFormat(table, copyFormat(element({ id: 's', type: 'text', style: { color: 'red' } })));
    expect(table.type === 'text' && table.html).toContain('font-size: 18px');
    expect(table.style).toEqual({ color: 'red' });
  });

  it('gives a shape fill, stroke and radius, and arrowheads only between lines', () => {
    const source = element({
      id: 'a', type: 'shape', shape: 'arrow', fill: null, stroke: '#ff0000', strokeWidth: 6, arrowEnd: true,
    });
    const line = element({ id: 'b', type: 'shape', shape: 'line', stroke: '#000000' });
    const rect = element({ id: 'c', type: 'shape', shape: 'rect', fill: '#00ff00' });

    applyFormat(line, copyFormat(source));
    applyFormat(rect, copyFormat(source));

    expect(line).toMatchObject({ shape: 'line', stroke: '#ff0000', strokeWidth: 6, arrowEnd: true });
    expect(rect).toMatchObject({ shape: 'rect', fill: null, stroke: '#ff0000', arrowEnd: false });
  });

  it('gives a picture the border and effects but never the crop or the source', () => {
    const source = element({
      id: 'a', type: 'image', src: 'assets/a.png', borderColor: '#ffffff', borderWidth: 8, borderRadius: 24,
      effects: [{ type: 'grayscale', amount: 1 }], sourceBox: { x: -10, y: 0, w: 400, h: 100 }, maskShape: 'circle',
    });
    const video = element({ id: 'b', type: 'video', src: 'assets/b.mp4' });

    applyFormat(video, copyFormat(source));

    expect(video).toMatchObject({
      src: 'assets/b.mp4', sourceBox: null, borderColor: '#ffffff', borderWidth: 8, borderRadius: 24,
      effects: [{ type: 'grayscale', amount: 1 }],
    });
    expect(video).not.toHaveProperty('maskShape');
  });

  it('carries only what both kinds have across kinds', () => {
    const text = element({ id: 'a', type: 'text', style: { color: 'red' }, opacity: 0.3 });
    const shape = element({ id: 'b', type: 'shape', shape: 'rect', fill: '#123456' });
    applyFormat(shape, copyFormat(text));
    expect(shape).toMatchObject({ opacity: 0.3, fill: '#123456', style: {} });
  });

  it('copies a snapshot, so later edits to the source do not leak into a paint', () => {
    const source = element({ id: 'a', type: 'shape', shape: 'rect', fill: '#111111' });
    const format = copyFormat(source);
    if (source.type === 'shape') source.fill = '#999999';
    const target = element({ id: 'b', type: 'shape', shape: 'rect' });
    applyFormat(target, format);
    expect(target.type === 'shape' && target.fill).toBe('#111111');
  });
});
