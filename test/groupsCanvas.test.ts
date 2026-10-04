// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDeck, type SlideElement } from '../src/shared/deck.js';
import { EditorCanvas } from '../src/renderer/editor/canvas.js';
import { EditorStore } from '../src/renderer/editor/store.js';
import { installCanvasDomShims } from './support/canvasHarness.js';

const rect = (id: string, x: number): SlideElement => ({
  id, type: 'shape', shape: 'rect', x, y: 100, w: 200, h: 200, rot: 0, z: 1, opacity: 1,
  class: [], style: {}, fill: '#888888', stroke: null, strokeWidth: 2, radius: 0, path: null, pathSize: null,
  arrowStart: false, arrowEnd: false,
});

function setup() {
  installCanvasDomShims();
  const deck = emptyDeck('Groups');
  deck.slides[0].elements = [
    rect('a', 100),
    rect('b', 400),
    rect('c', 1300),
    {
      id: 't', type: 'text', x: 1300, y: 600, w: 400, h: 120, rot: 0, z: 1, opacity: 1,
      class: [], style: {}, html: 'Words', align: 'left', valign: 'top',
    },
  ];
  const store = new EditorStore(deck, '/tmp/groups');
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const canvas = new EditorCanvas(host, store);
  host.querySelector<HTMLElement>('.stage')!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1920, height: 1080 }) as DOMRect;
  const fire = (target: EventTarget, type: string, x: number, y: number, init: MouseEventInit = {}) =>
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, ...init }));
  const click = (x: number, y: number, init: MouseEventInit = {}) => {
    fire(host, 'pointerdown', x, y, init);
    fire(host, 'pointerup', x, y, init);
  };
  const drag = (from: EventTarget, start: [number, number], steps: Array<[number, number]>, init: MouseEventInit = {}) => {
    fire(from, 'pointerdown', ...start, init);
    for (const step of steps) fire(host, 'pointermove', ...step, init);
    fire(host, 'pointerup', ...steps.at(-1)!, init);
  };
  const el = (id: string) => store.slide!.elements.find((element) => element.id === id)!;
  const selection = () => [...store.get().selection].sort();
  store.select(['a', 'b']);
  expect(store.groupSelection()).toBe(true);
  store.clearSelection();
  return { store, canvas, host, click, drag, el, selection };
}

describe('groups on the canvas', () => {
  beforeEach(() => document.body.replaceChildren());

  it('selects the whole group, framed once, and drills in on a second click', () => {
    const { host, click, selection } = setup();
    click(200, 200);
    expect(selection()).toEqual(['a', 'b']);
    expect(host.querySelectorAll('.group-frame')).toHaveLength(1);
    expect(host.querySelectorAll('.sel-box.group-member')).toHaveLength(2);
    expect(host.querySelectorAll('.group-member .handle')).toHaveLength(0);

    click(200, 200);
    expect(selection()).toEqual(['a']);
    expect(host.querySelectorAll('.group-frame')).toHaveLength(0);

    // Inside the group a click on the other member selects just it; outside, the group is left.
    click(500, 200);
    expect(selection()).toEqual(['b']);
    click(1400, 200);
    expect(selection()).toEqual(['c']);
  });

  it('takes the whole group when a marquee touches one member', () => {
    const { host, el, selection } = setup();
    const fire = (type: string, x: number, y: number) =>
      host.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
    fire('pointerdown', 50, 50);
    fire('pointermove', 150, 150);
    fire('pointerup', 150, 150);
    expect(selection()).toEqual(['a', 'b']);
    expect(el('a').x).toBe(100);
  });

  it('scales the members inside the group frame, text type untouched, as one undo step', () => {
    const { store, host, click, drag, el } = setup();
    click(200, 200);
    const corner = host.querySelector<HTMLElement>('.group-frame .handle-se')!;
    // The group spans 100..600 x 100..300; doubling it from the top-left corner.
    drag(corner, [600, 300], [[620, 320], [1100, 500]]);
    expect([el('a').x, el('a').y, el('a').w, el('a').h]).toEqual([100, 100, 400, 400]);
    expect([el('b').x, el('b').y, el('b').w, el('b').h]).toEqual([700, 100, 400, 400]);
    store.undo();
    expect([el('b').x, el('b').w]).toEqual([400, 200]);
  });

  it('turns every member about the group centre with the modifier on a frame handle', () => {
    const { host, click, drag, el } = setup();
    click(200, 200);
    const east = host.querySelector<HTMLElement>('.group-frame .handle-e')!;
    // Centre (350, 200); a quarter turn clockwise.
    drag(east, [600, 200], [[600, 230], [350, 450]], { ctrlKey: true, metaKey: true });
    expect(el('a').rot).toBe(90);
    expect([el('a').x + el('a').w / 2, el('a').y + el('a').h / 2]).toEqual([350, 50]);
    expect([el('b').x + el('b').w / 2, el('b').y + el('b').h / 2]).toEqual([350, 350]);
  });

  it('edits grouped text on a double-click', () => {
    const { store, canvas, click, selection } = setup();
    store.select(['c', 't']);
    expect(store.groupSelection()).toBe(true);
    store.clearSelection();
    click(1400, 650);
    expect(selection()).toEqual(['c', 't']);
    click(1400, 650);
    expect(canvas.isEditing()).toBe(true);
    expect(selection()).toEqual(['t']);
  });

  it('dissolves a group whose partner is deleted, and duplicates into a new group', () => {
    const { store, el } = setup();
    store.select(['a', 'b']);
    store.duplicateSelection();
    const copies = [...store.get().selection].map((id) => el(id));
    expect(copies[0].groupIds).toEqual(copies[1].groupIds);
    expect(copies[0].groupIds).not.toEqual(el('a').groupIds);

    store.select(['a']);
    store.deleteSelection();
    expect(el('b').groupIds).toBeUndefined();
  });
});
