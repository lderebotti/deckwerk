// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDeck, type SlideElement } from '../src/shared/deck.js';
import { EditorCanvas } from '../src/renderer/editor/canvas.js';
import { formatPainterButton } from '../src/renderer/editor/shellWiring.js';
import { EditorStore } from '../src/renderer/editor/store.js';
import { installCanvasDomShims } from './support/canvasHarness.js';

const rect = (id: string, x: number, fill: string): SlideElement => ({
  id, type: 'shape', shape: 'rect', x, y: 100, w: 200, h: 200, rot: 0, z: 1, opacity: 1,
  class: [], style: {}, fill, stroke: null, strokeWidth: 2, radius: 0, path: null, pathSize: null,
  arrowStart: false, arrowEnd: false,
});

function setup() {
  installCanvasDomShims();
  const deck = emptyDeck('Painter');
  deck.slides[0].elements = [
    rect('a', 100, '#ff0000'),
    rect('b', 500, '#00ff00'),
    rect('c', 900, '#0000ff'),
    {
      id: 't', type: 'text', x: 100, y: 600, w: 600, h: 120, rot: 0, z: 1, opacity: 1,
      class: [], style: {}, html: 'Words', align: 'left', valign: 'top',
    },
  ];
  const store = new EditorStore(deck, '/tmp/painter');
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const canvas = new EditorCanvas(host, store);
  host.querySelector<HTMLElement>('.stage')!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1920, height: 1080 }) as DOMRect;
  const button = formatPainterButton(canvas, store);
  document.body.appendChild(button);
  const click = (x: number, y: number) => {
    host.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
    host.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
  };
  const fill = (id: string) => (store.slide!.elements.find((element) => element.id === id) as { fill: string }).fill;
  return { store, canvas, host, button, click, fill };
}

describe('format painter on the canvas', () => {
  beforeEach(() => document.body.replaceChildren());

  it('paints the next object clicked, once, as one undo step', () => {
    const { store, canvas, host, button, click, fill } = setup();
    expect(button.disabled).toBe(true);
    store.select(['a']);
    expect(button.disabled).toBe(false);

    button.click();
    expect(canvas.isFormatPainting()).toBe(true);
    expect(button.classList.contains('primary')).toBe(true);
    expect(host.classList.contains('format-painting')).toBe(true);

    click(600, 200);
    expect(fill('b')).toBe('#ff0000');
    expect([...store.get().selection]).toEqual(['b']);
    expect(canvas.isFormatPainting()).toBe(false);
    expect(button.classList.contains('primary')).toBe(false);

    // A plain click afterwards selects again rather than painting.
    click(1000, 200);
    expect(fill('c')).toBe('#0000ff');
    expect([...store.get().selection]).toEqual(['c']);

    store.undo();
    expect(fill('b')).toBe('#00ff00');
  });

  it('keeps painting after a double-click until put down', () => {
    const { store, canvas, button, click, fill } = setup();
    store.select(['a']);
    button.click();
    button.click();
    button.dispatchEvent(new MouseEvent('dblclick'));
    expect(canvas.isFormatPainterSticky()).toBe(true);

    click(600, 200);
    click(1000, 200);
    expect([fill('b'), fill('c')]).toEqual(['#ff0000', '#ff0000']);
    expect(canvas.isFormatPainting()).toBe(true);

    // A click on empty canvas puts it down without painting anything.
    click(1800, 1000);
    expect(canvas.isFormatPainting()).toBe(false);
  });

  it('is put down by text editing, never armed alongside it', () => {
    const { store, canvas, button } = setup();
    store.select(['a']);
    button.click();
    canvas.beginTextEdit('t');
    expect(canvas.isFormatPainting()).toBe(false);
    expect(canvas.isEditing()).toBe(true);
  });

  it('pastes a copied format onto a whole selection in one step', () => {
    const { store, canvas, fill } = setup();
    store.select(['c']);
    expect(canvas.copyFormatFromSelection()).toBe(true);
    store.select(['a', 'b']);
    expect(canvas.pasteFormatToSelection()).toBe(true);
    expect([fill('a'), fill('b')]).toEqual(['#0000ff', '#0000ff']);
    store.undo();
    expect([fill('a'), fill('b')]).toEqual(['#ff0000', '#00ff00']);
  });
});
