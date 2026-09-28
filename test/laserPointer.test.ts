// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bindPresentKeys } from '../src/renderer/player/keys.js';
import type { Player } from '../src/renderer/player/player.js';

describe('laser pointer', () => {
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
});
