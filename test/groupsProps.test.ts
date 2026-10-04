// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { ElementSchema, emptyDeck, type SlideElement } from '../src/shared/deck.js';
import { fitUnit, placeInScaledBox, selectionUnits, unitBox } from '../src/shared/groups.js';
import { Inspector } from '../src/renderer/editor/inspector.js';
import { TimelinePanel } from '../src/renderer/editor/timelinePanel.js';
import { EditorStore } from '../src/renderer/editor/store.js';
import { installCanvasDomShims } from './support/canvasHarness.js';

const rect = (id: string, x: number, y: number, z: number, groupIds?: string[]): SlideElement => ElementSchema.parse({
  id, type: 'shape', shape: 'rect', x, y, w: 100, h: 100, z, ...(groupIds ? { groupIds } : {}),
});

describe('group units', () => {
  it('treats a group held whole as one box and everything else as its own', () => {
    const elements = [rect('a', 0, 0, 1, ['g']), rect('b', 200, 100, 2, ['g']), rect('c', 500, 0, 3)];
    const units = selectionUnits(elements, new Set(['a', 'b', 'c']));
    expect(units).toEqual([{ id: 'g', members: ['a', 'b'] }, { id: 'c', members: ['c'] }]);
    expect(unitBox(elements, ['a', 'b'])).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    expect(unitBox(elements, ['c'])).toEqual({ x: 500, y: 0, w: 100, h: 100 });
  });

  it('moves and scales a group inside its box', () => {
    const elements = [rect('a', 0, 0, 1, ['g']), rect('b', 200, 100, 2, ['g'])];
    fitUnit(elements, ['a', 'b'], { x: 1000 });
    expect(elements.map((element) => [element.x, element.y])).toEqual([[1000, 0], [1200, 100]]);
    fitUnit(elements, ['a', 'b'], { w: 600 });
    expect(elements.map((element) => [element.x, element.w])).toEqual([[1000, 200], [1400, 200]]);
    expect(placeInScaledBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 20, h: 20 }, { x: 0, y: 0, w: 40, h: 20 }))
      .toEqual({ x: 0, y: 0, w: 20, h: 10 });
  });
});

describe('a group in Props and Build', () => {
  beforeEach(() => document.body.replaceChildren());

  function setup() {
    installCanvasDomShims();
    const deck = emptyDeck('Props');
    deck.slides[0].elements = [rect('a', 0, 0, 1, ['g']), rect('b', 200, 100, 2, ['g']), rect('c', 800, 400, 3)];
    const store = new EditorStore(deck, '/tmp/props');
    const host = document.createElement('aside');
    document.body.appendChild(host);
    new Inspector(host, store);
    const el = (id: string) => store.slide!.elements.find((element) => element.id === id)!;
    const field = (label: string) => [...host.querySelectorAll<HTMLElement>('.field')]
      .find((node) => node.querySelector('span')?.textContent === label)?.querySelector('input') ?? null;
    const change = (input: HTMLInputElement, value: number) => {
      input.value = String(value);
      input.dispatchEvent(new Event('change'));
    };
    return { store, host, el, field, change };
  }

  it('reads and edits the group as one box, with no per-member rotation or Z', () => {
    const { store, el, field, change } = setup();
    store.select(['a', 'b']);
    expect(field('X')!.value).toBe('0');
    expect(field('W')!.value).toBe('300');
    expect(field('ROT')).toBeNull();
    expect(field('Z')).toBeNull();

    change(field('X')!, 50);
    expect([el('a').x, el('b').x]).toEqual([50, 250]);
    change(field('W')!, 600);
    expect([el('a').x, el('a').w, el('b').x, el('b').w]).toEqual([50, 200, 450, 200]);
    store.undo();
    expect([el('a').w, el('b').x]).toEqual([100, 250]);
  });

  it('aligns a group as one box beside a loose object', () => {
    const { store, host, el } = setup();
    store.select(['a', 'b', 'c']);
    host.querySelector<HTMLButtonElement>('button[title="Align left"]')!.click();
    // The group already sits furthest left; c joins it, and the group keeps its own layout.
    expect([el('a').x, el('b').x, el('c').x]).toEqual([0, 200, 0]);
  });

  it('brings the group to front with its members in their own order', () => {
    const { store, host, el } = setup();
    store.select(['a', 'b']);
    host.querySelector<HTMLButtonElement>('button[title="Bring to front"]')!.click();
    expect(el('a').z).toBeGreaterThan(el('c').z);
    expect(el('b').z).toBeGreaterThan(el('a').z);
  });

  it('builds a group as one reveal', () => {
    const { store } = setup();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new TimelinePanel(host, store);
    store.select(['a', 'b']);
    const add = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add animation')!;
    expect(add.title).toBe('Hide the group until the next click');
    add.click();
    expect(store.slide!.timeline.map((entry) => [entry.action.target, entry.trigger.on]))
      .toEqual([['a', 'click'], ['b', 'afterPrev']]);
  });
});
