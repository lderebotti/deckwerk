// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDeck, parseDeck } from '../src/shared/deck.js';
import { addInk, inkShape, simplifyStroke } from '../src/shared/ink.js';
import { clearInk, drawInk, restoreInk, takeInk } from '../src/renderer/player/ink.js';

const red = { color: '#ff2a2a', width: 6 };

describe('kept ink', () => {
  it('drops points that do not change the line, and keeps the corners that do', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: 100 + (i % 2) * 0.4 }));
    expect(simplifyStroke(line)).toEqual([line[0], line[49]]);
    const corner = [{ x: 0, y: 0 }, { x: 50, y: 0.2 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 100 }];
    expect(simplifyStroke(corner)).toEqual([corner[0], corner[2], corner[4]]);
  });

  it('boxes a stroke with half its width on every side', () => {
    const shape = inkShape({ ...red, points: [{ x: 100, y: 200 }, { x: 300, y: 250 }] }, 5)!;
    expect(shape).toMatchObject({
      type: 'shape', shape: 'path', ink: true, stroke: '#ff2a2a', strokeWidth: 6, fill: null, z: 5,
      x: 97, y: 197, w: 206, h: 56, pathSize: { w: 206, h: 56 }, path: 'M3 3 L203 53',
    });
    // A tap is a dot.
    expect(inkShape({ ...red, points: [{ x: 10, y: 10 }] }, 1)).toMatchObject({ w: 6, h: 6, path: 'M3 3 L3 3' });
    // What crosses the process boundary is checked; the colour lands in SVG markup.
    expect(inkShape({ ...red, color: 'red" onload="x', points: [{ x: 1, y: 1 }] }, 1)).toBeNull();
    expect(inkShape({ ...red, width: 0, points: [{ x: 1, y: 1 }] }, 1)).toBeNull();
    expect(inkShape({ ...red, points: [] }, 1)).toBeNull();
  });

  it('lands above the slide as valid deck shapes and skips slides that are gone', () => {
    const deck = emptyDeck('Talk');
    const slide = deck.slides[0];
    const top = Math.max(0, ...slide.elements.map((e) => e.z));
    const added = addInk(deck, [
      { slideId: slide.id, strokes: [{ ...red, points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }, { ...red, points: [{ x: 5, y: 5 }] }] },
      { slideId: 'deleted-mid-show', strokes: [{ ...red, points: [{ x: 1, y: 1 }] }] },
    ]);
    expect(added).toBe(2);
    expect(slide.elements.filter((e) => e.type === 'shape' && e.ink).map((e) => e.z)).toEqual([top + 1, top + 2]);
    expect(() => parseDeck(deck)).not.toThrow();
  });
});

describe('ink during the show', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => {
    vi.restoreAllMocks();
    takeInk();
    document.body.replaceChildren();
  });

  const stage = document.createElement('div');
  const show = (slideId: string) => {
    const slide = document.createElement('div');
    slide.dataset.slideId = slideId;
    stage.replaceChildren(slide);
    restoreInk(stage);
  };

  it('comes back with its slide and is handed over stroke by stroke', () => {
    show('a');
    drawInk(stage, { ...red, from: { x: 1, y: 1 }, to: { x: 1, y: 1 }, start: true });
    drawInk(stage, { ...red, from: { x: 1, y: 1 }, to: { x: 5, y: 5 } });
    drawInk(stage, { color: '#3b82f6', width: 14, from: { x: 9, y: 9 }, to: { x: 9, y: 9 }, start: true });
    show('b');
    expect(stage.querySelector('canvas.ink')).toBeNull();
    show('a');
    expect(stage.querySelector('canvas.ink')).not.toBeNull();

    expect(takeInk()).toEqual([{ slideId: 'a', strokes: [
      { ...red, points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] },
      { color: '#3b82f6', width: 14, points: [{ x: 9, y: 9 }] },
    ] }]);
    expect(takeInk()).toEqual([]);
  });

  it('stays erased once E erases it', () => {
    show('a');
    drawInk(stage, { ...red, from: { x: 1, y: 1 }, to: { x: 1, y: 1 }, start: true });
    clearInk(stage);
    show('b');
    show('a');
    expect(stage.querySelector('canvas.ink')).toBeNull();
    expect(takeInk()).toEqual([]);
  });
});
