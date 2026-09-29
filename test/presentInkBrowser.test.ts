import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDeck } from '../src/shared/deck.js';
import { Cdp, electronBinary, eventually, findTarget } from './support/browserSession.js';
import { launchDesktopEditor, type DesktopEditor } from './support/desktopEditorSession.js';

/**
 * Pen ink survives the show: drawn in the real audience window with real
 * input, handed to the editor as the window closes, and kept as ink shapes
 * after the author answers the editor's prompt.
 */

let app: DesktopEditor | null = null;
let audience: Cdp | null = null;

afterEach(async () => {
  audience?.close();
  audience = null;
  await app?.close();
  app = null;
});

describe.skipIf(!electronBinary)('presentation ink', () => {
  it('offers to keep ink drawn during the show, and keeps it as shapes', async () => {
    app = await launchDesktopEditor('ink-text', 'Draw on me');
    await app.cdp.clickByText('button', 'Present', 'Present');
    const target = await findTarget(app.debugPort, (t) => t.url.includes('/present/index.html'), app.log);
    audience = await Cdp.connect(target.webSocketDebuggerUrl!);
    const stage = await eventually(
      () => audience!.evaluate<{ x: number; y: number; w: number; h: number } | null>(`(() => {
        const stage = document.querySelector('.player-root > .stage');
        if (!stage?.querySelector('[data-slide-id]')) return null;
        const r = stage.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })()`),
      'the audience window never rendered a slide',
    );

    // P picks up the pen; a real drag draws one stroke across the slide.
    await audience.typeKeys('p');
    const at = (fx: number, fy: number) => [stage.x + fx * stage.w, stage.y + fy * stage.h] as const;
    const drag = await audience.beginDrag(...at(0.25, 0.5));
    for (let i = 1; i <= 10; i++) await drag.moveTo(...at(0.25 + i * 0.05, 0.5 + (i % 2) * 0.05));
    await drag.drop();
    expect(await audience.evaluate<boolean>(`Boolean(document.querySelector('.stage > canvas.ink'))`)).toBe(true);

    // Escape puts the pen down; the second one ends the show.
    await audience.key('Escape', 27);
    await audience.key('Escape', 27);

    await eventually(
      () => app!.cdp.evaluate<boolean>(`Boolean(document.querySelector('.keep-ink-dialog'))`),
      'the editor never asked whether to keep the ink',
    );
    await app.cdp.clickByText('.keep-ink-dialog button', 'Keep');

    const kept = await eventually(async () => {
      const deck = parseDeck(JSON.parse(await readFile(join(app!.deckDir, 'deck.json'), 'utf8')));
      const ink = deck.slides[0].elements.filter((e) => e.type === 'shape' && e.ink);
      return ink.length ? ink : null;
    }, 'the kept ink never reached deck.json');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ shape: 'path', stroke: '#ff2a2a', strokeWidth: 6, ink: true });
    // Its box spans the drag: a quarter to three quarters of the slide's width.
    expect(kept[0].x).toBeCloseTo(0.25 * 1920 - 3, -1);
    expect(kept[0].x + kept[0].w).toBeCloseTo(0.75 * 1920 + 3, -1);
    // It is one change: one undo (a real Ctrl+Z) takes all of it back off.
    await app.cdp.call('Page.bringToFront');
    await app.cdp.evaluate(`document.activeElement?.blur()`);
    for (const type of ['rawKeyDown', 'keyUp']) {
      await app.cdp.call('Input.dispatchKeyEvent', {
        type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
        modifiers: process.platform === 'darwin' ? 4 : 2,
      });
    }
    await eventually(async () => {
      const deck = parseDeck(JSON.parse(await readFile(join(app!.deckDir, 'deck.json'), 'utf8')));
      return !deck.slides[0].elements.some((e) => e.type === 'shape' && e.ink);
    }, 'undo did not take the ink back off the slide');
  }, 180_000);
});
