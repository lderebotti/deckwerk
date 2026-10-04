// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDeck } from '../src/shared/deck.js';
import type { PresentationCommand } from '../src/shared/ipc.js';
import { bindPresentKeys, LASER_TRAIL_KEY, pointLaserAt } from '../src/renderer/player/keys.js';
import type { Player } from '../src/renderer/player/player.js';
import { createSpeakerView } from '../src/renderer/presenter/speakerView.js';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

describe('laser pointer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('toggles with L, follows the mouse, and is removed on unbind', () => {
    const unbind = bindPresentKeys(window, {} as Player);
    const dot = document.querySelector<HTMLElement>('.laser-pointer')!;
    expect(dot.hidden).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    expect(dot.hidden).toBe(false);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 200 }));
    expect(dot.style.transform).toBe('translate(300px, 200px)');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', ctrlKey: true }));
    expect(dot.hidden).toBe(true);

    unbind();
    expect(document.querySelector('.laser-pointer')).toBeNull();
  });

  it('relays the Speaker View pointer to the audience as a fraction of the slide', () => {
    const commands: PresentationCommand[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createSpeakerView({ host, resolveSrc: (src) => src, onCommand: (c) => commands.push(c) });
    view.setDeck(emptyDeck('Talk'));
    const preview = host.querySelector<HTMLElement>('.speaker-current')!;
    vi.spyOn(preview.querySelector('.stage')!, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 800, 450));

    // Off: pointing does nothing.
    preview.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 275 }));
    expect(commands).toEqual([]);

    expect(view.toggleLaser()).toBe(true);
    preview.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 275 }));
    expect(commands).toEqual([{ type: 'laser', at: { x: 0.5, y: 0.5 } }]);
    // Off the slide (the letterbox) hides it, once.
    preview.dispatchEvent(new MouseEvent('mousemove', { clientX: 950, clientY: 275 }));
    preview.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 275 }));
    expect(commands.slice(1)).toEqual([{ type: 'laser', at: null }]);
    view.destroy();

    // The audience places its own dot on its own stage.
    const unbind = bindPresentKeys(window, {} as Player);
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1920, 1080));
    pointLaserAt(stage, { x: 0.5, y: 0.25 });
    const dot = document.querySelector<HTMLElement>('.laser-pointer')!;
    expect(dot.hidden).toBe(false);
    expect(dot.style.transform).toBe('translate(960px, 270px)');
    pointLaserAt(stage, null);
    expect(dot.hidden).toBe(true);
    unbind();
  });

  it('smears behind the moving dot only when opted in, fading out once the mouse rests', () => {
    // Off by default: no trail at all.
    const unbound = bindPresentKeys(window, {} as Player);
    expect(document.querySelector('.laser-trail')).toBeNull();
    unbound();
    localStorage.setItem(LASER_TRAIL_KEY, 'true');

    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const strokes: number[] = [];
    const ctx = {
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() { strokes.push(this.lineWidth); },
      lineWidth: 0, lineCap: '', shadowColor: '', shadowBlur: 0, strokeStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const unbind = bindPresentKeys(window, {} as Player);
    const move = (x: number) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 200 }));

    // Off: moving leaves no trail.
    move(100);
    move(200);
    vi.advanceTimersByTime(50);
    expect(strokes).toEqual([]);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    for (let x = 100; x <= 400; x += 50) {
      move(x);
      vi.advanceTimersByTime(16);
    }
    // One frame: segments behind the dot, oldest first and thinnest.
    strokes.splice(0);
    vi.advanceTimersByTime(16);
    const frame = strokes.splice(0);
    expect(frame.length).toBeGreaterThan(0);
    expect(frame.at(-1)!).toBeGreaterThan(frame[0]);

    // At rest it fades away, and then no more frames are drawn.
    vi.advanceTimersByTime(400);
    strokes.splice(0);
    vi.advanceTimersByTime(200);
    expect(strokes).toEqual([]);

    unbind();
    expect(document.querySelector('.laser-trail')).toBeNull();
    vi.useRealTimers();
    localStorage.removeItem(LASER_TRAIL_KEY);
  });
});
