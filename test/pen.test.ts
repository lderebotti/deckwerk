// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDeck } from '../src/shared/deck.js';
import type { PresentationCommand } from '../src/shared/ipc.js';
import { bindPresentKeys, laserTrailEnabled } from '../src/renderer/player/keys.js';
import { clearInk, takeInk } from '../src/renderer/player/ink.js';
import type { Player } from '../src/renderer/player/player.js';
import { createSpeakerView } from '../src/renderer/presenter/speakerView.js';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
const pointer = (target: EventTarget, type: string, x: number, y: number, buttons = 1) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons, bubbles: true }));

describe('pen', () => {
  // jsdom has no 2D canvas; the strokes themselves are Chromium's to paint.
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => {
    vi.restoreAllMocks();
    takeInk();
    document.body.replaceChildren();
  });

  it('draws with P, keeps clicks from advancing, erases with E, and Escape puts it down', () => {
    const root = document.createElement('div');
    root.className = 'player-root';
    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.style.width = '1920px';
    stage.style.height = '1080px';
    root.appendChild(stage);
    document.body.appendChild(root);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 960, 540));
    const onExit = vi.fn();
    const advanced = vi.fn();
    const unbind = bindPresentKeys(window, {} as Player, { onExit });
    window.addEventListener('click', advanced);

    // Off: pointing draws nothing and a click still advances.
    pointer(window, 'pointerdown', 100, 100);
    window.dispatchEvent(new MouseEvent('click', { button: 0 }));
    expect(stage.querySelector('canvas.ink')).toBeNull();
    expect(advanced).toHaveBeenCalledTimes(1);

    key('p');
    expect(document.body.classList.contains('inking')).toBe(true);
    pointer(window, 'pointerdown', 100, 100);
    pointer(window, 'pointermove', 200, 150);
    pointer(window, 'pointerup', 200, 150, 0);
    window.dispatchEvent(new MouseEvent('click', { button: 0 }));
    const canvas = stage.querySelector<HTMLCanvasElement>('canvas.ink')!;
    expect(canvas.width).toBe(1920);
    expect(advanced).toHaveBeenCalledTimes(1);

    // Picking from the toolbar's palette neither draws nor advances.
    const yellow = document.querySelector<HTMLButtonElement>('.present-toolbar [aria-label="Yellow pen"]')!;
    clearInk(stage);
    pointer(yellow, 'pointerdown', 10, 500);
    yellow.click();
    expect(yellow.getAttribute('aria-pressed')).toBe('true');
    expect(stage.querySelector('canvas.ink')).toBeNull();
    expect(advanced).toHaveBeenCalledTimes(1);

    key('e');
    expect(stage.querySelector('canvas.ink')).toBeNull();

    key('Escape');
    expect(onExit).not.toHaveBeenCalled();
    expect(document.body.classList.contains('inking')).toBe(false);
    key('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);

    window.removeEventListener('click', advanced);
    unbind();
    expect(document.querySelector('.ink-palette, .present-toolbar')).toBeNull();
  });

  it('relays Speaker View strokes in slide pixels and keeps them across a build step', () => {
    const commands: PresentationCommand[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createSpeakerView({ host, resolveSrc: (src) => src, onCommand: (c) => commands.push(c) });
    view.setDeck(emptyDeck('Talk'));
    const preview = host.querySelector<HTMLElement>('.speaker-current')!;
    const mockStage = () => vi.spyOn(preview.querySelector('.stage')!, 'getBoundingClientRect')
      .mockReturnValue(rect(100, 50, 960, 540));
    mockStage();

    expect(view.toggleLaser()).toBe(true);
    expect(view.togglePen()).toBe(true);
    // The crosshair belongs to the current slide's preview, not the whole Speaker View.
    expect(preview.classList.contains('ink-surface')).toBe(true);
    expect(document.body.classList.contains('ink-surface')).toBe(false);
    // The pen and the laser are one pointer; picking up the pen drops the laser.
    expect(host.querySelector('.speaker-laser')!.getAttribute('aria-pressed')).toBe('false');
    pointer(preview, 'pointerdown', 100, 50);
    pointer(preview, 'pointermove', 580, 320);
    const red = { color: '#ff2a2a', width: 6 };
    expect(commands.filter((c) => c.type === 'ink')).toEqual([
      { type: 'ink', ...red, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, start: true },
      { type: 'ink', ...red, from: { x: 0, y: 0 }, to: { x: 960, y: 540 } },
    ]);
    pointer(preview, 'pointerup', 580, 320, 0);

    // The footer palette sets the next stroke's colour and width.
    host.querySelector<HTMLButtonElement>('[aria-label="Blue pen"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Thick line"]')!.click();
    expect(host.querySelector('[aria-label="Blue pen"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[aria-label="Red pen"]')!.getAttribute('aria-pressed')).toBe('false');
    pointer(preview, 'pointerdown', 100, 50);
    expect(commands.at(-1)).toMatchObject({ type: 'ink', color: '#3b82f6', width: 14 });
    pointer(preview, 'pointerup', 100, 50, 0);

    // A build step rebuilds the preview; the slide's ink is replayed onto it.
    view.setState({ cursor: { slide: 0, step: 1 }, steps: 2, startedAt: 0, slideStartedAt: 0 });
    expect(preview.querySelector('.stage > canvas.ink')).not.toBeNull();

    // Speaker View switches the laser's trail for both screens.
    const trail = host.querySelector<HTMLButtonElement>('.speaker-trail')!;
    trail.click();
    expect([trail.getAttribute('aria-pressed'), laserTrailEnabled()]).toEqual(['true', true]);
    trail.click();
    expect([trail.getAttribute('aria-pressed'), laserTrailEnabled()]).toEqual(['false', false]);

    view.clearInk();
    expect(preview.querySelector('.stage > canvas.ink')).toBeNull();
    expect(commands.at(-1)).toEqual({ type: 'clearInk' });
    view.setState({ cursor: { slide: 0, step: 0 }, steps: 2, startedAt: 0, slideStartedAt: 0 });
    expect(preview.querySelector('.stage > canvas.ink')).toBeNull();
    view.destroy();
  });

  it('puts the laser, the pen and slide changes on a toolbar that shows while the mouse moves', () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const advanced = vi.fn();
    const unbind = bindPresentKeys(window, {} as Player, { onNext, onPrev });
    window.addEventListener('click', advanced);
    const bar = document.querySelector<HTMLElement>('.present-toolbar')!;
    const tool = (label: string) => bar.querySelector<HTMLButtonElement>(`[aria-label^="${label}"]`)!;
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(rect(16, 1000, 300, 40));
    const move = (x: number, y: number) => pointer(window, 'mousemove', x, y, 0);

    // The toolbar shows only while the pointer is in its corner. The cursor,
    // which the present window hides, comes back on any move and goes once
    // the mouse rests.
    expect(bar.classList.contains('shown')).toBe(false);
    expect(document.body.classList.contains('pointer-moving')).toBe(false);
    move(900, 400);
    expect(bar.classList.contains('shown')).toBe(false);
    expect(document.body.classList.contains('pointer-moving')).toBe(true);
    move(200, 990);
    expect(bar.classList.contains('shown')).toBe(true);
    vi.advanceTimersByTime(3000);
    // Resting over it keeps it; the cursor alone rests away.
    expect(bar.classList.contains('shown')).toBe(true);
    expect(document.body.classList.contains('pointer-moving')).toBe(false);
    move(900, 400);
    expect(bar.classList.contains('shown')).toBe(false);
    move(200, 990);
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    expect(bar.classList.contains('shown')).toBe(false);

    // Its buttons act without the click advancing the slide.
    tool('Next').click();
    tool('Previous').click();
    expect([onNext.mock.calls.length, onPrev.mock.calls.length, advanced.mock.calls.length]).toEqual([1, 1, 0]);

    // Laser and pen take turns, and the keys and the buttons agree.
    tool('Laser pointer').click();
    expect(tool('Laser pointer').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector<HTMLElement>('.laser-pointer')!.hidden).toBe(false);
    key('p');
    expect(tool('Laser pointer').getAttribute('aria-pressed')).toBe('false');
    expect(tool('Pen').getAttribute('aria-pressed')).toBe('true');
    expect(document.body.classList.contains('inking')).toBe(true);

    // With a tool in hand it behaves the same.
    move(900, 400);
    expect(bar.classList.contains('shown')).toBe(false);
    move(200, 990);
    expect(bar.classList.contains('shown')).toBe(true);
    // A press on the toolbar never starts a stroke.
    pointer(tool('Pen'), 'pointerdown', 100, 1010);
    expect(document.querySelector('canvas.ink')).toBeNull();

    key('Escape');
    expect(tool('Pen').getAttribute('aria-pressed')).toBe('false');

    // The laser's trail is opt-in and switched from the toolbar.
    expect(tool('Laser trail').getAttribute('aria-pressed')).toBe('false');
    tool('Laser trail').click();
    expect(tool('Laser trail').getAttribute('aria-pressed')).toBe('true');
    expect(laserTrailEnabled()).toBe(true);
    tool('Laser trail').click();
    expect(laserTrailEnabled()).toBe(false);
    window.removeEventListener('click', advanced);
    unbind();
    expect(document.querySelector('.present-toolbar')).toBeNull();
    vi.useRealTimers();
  });
});
