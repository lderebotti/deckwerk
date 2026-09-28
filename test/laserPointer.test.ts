// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDeck } from '../src/shared/deck.js';
import type { PresentationCommand } from '../src/shared/ipc.js';
import { bindPresentKeys, pointLaserAt } from '../src/renderer/player/keys.js';
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
});
