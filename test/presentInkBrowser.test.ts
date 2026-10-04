import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDeck } from '../src/shared/deck.js';
import { Cdp, electronBinary, eventually, findTarget } from './support/browserSession.js';
import { launchDesktopEditor, type DesktopEditor } from './support/desktopEditorSession.js';

/**
 * Pen ink survives the show: drawn in the real audience window with real
 * input, handed to the editor as the window closes, and kept as ink shapes
 * after the author answers the editor's prompt. The next show includes it
 * unless the Present menu's "Show saved ink" is unchecked, which hides it in
 * the editor too.
 */

let app: DesktopEditor | null = null;
let audience: Cdp | null = null;

afterEach(async () => {
  audience?.close();
  audience = null;
  await app?.close();
  app = null;
});

const AUDIENCE = (t: { url: string }) => t.url.includes('/present/index.html');

/** Present from the editor's toolbar and connect to the audience window it opens. */
async function present(): Promise<Cdp> {
  await app!.cdp.clickByText('button', 'Present', 'Present');
  const target = await findTarget(app!.debugPort, AUDIENCE, app!.log);
  return Cdp.connect(target.webSocketDebuggerUrl!);
}

/** End the show with Escape and wait for the audience window to be gone. */
async function endShow(): Promise<void> {
  // The window closes on keydown, taking the connection with it before keyup.
  await audience!.key('Escape', 27).catch(() => {});
  audience!.close();
  audience = null;
  await eventually(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${app!.debugPort}/json/list`)).json() as Array<{ url: string }>;
    return !targets.some(AUDIENCE);
  }, 'the audience window did not close');
}

describe.skipIf(!electronBinary)('presentation ink', () => {
  it('offers to keep ink drawn during the show, and keeps it as shapes', async () => {
    app = await launchDesktopEditor('ink-text', 'Draw on me');
    audience = await present();
    // Aim at the stage once it has settled: the window is still being sized
    // to its display when the first slide paints.
    const stage = (await eventually(
      () => audience!.evaluate<{ x: number; y: number; w: number; h: number } | null>(`(async () => {
        const rect = () => {
          const r = document.querySelector('.player-root > .stage:has([data-slide-id])')?.getBoundingClientRect();
          return r ? JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }) : null;
        };
        const before = rect();
        await new Promise((resolve) => setTimeout(resolve, 300));
        return before && before === rect() ? JSON.parse(before) : null;
      })()`),
      'the audience window never settled on a slide',
    ))!;

    // The laser's smear is opt-in: a first show has none.
    expect(await audience.evaluate<boolean>(`Boolean(document.querySelector('.laser-trail'))`)).toBe(false);

    // P picks up the pen; a real drag draws one stroke across the slide.
    await audience.typeKeys('p');
    const at = (fx: number, fy: number) => [stage.x + fx * stage.w, stage.y + fy * stage.h] as const;
    const drag = await audience.beginDrag(...at(0.25, 0.5));
    for (let i = 1; i <= 10; i++) await drag.moveTo(...at(0.25 + i * 0.05, 0.5 + (i % 2) * 0.05));
    await drag.drop();
    expect(await audience.evaluate<boolean>(`Boolean(document.querySelector('.stage > canvas.ink'))`)).toBe(true);

    // Escape puts the pen down; the second one ends the show.
    await audience.key('Escape', 27);
    await endShow();

    await eventually(
      () => app!.cdp.evaluate<boolean>(`Boolean(document.querySelector('.keep-ink-dialog'))`),
      'the editor never asked whether to keep the ink',
    );
    await app.cdp.clickByText('.keep-ink-dialog button', 'Keep');

    const kept = (await eventually(async () => {
      const deck = parseDeck(JSON.parse(await readFile(join(app!.deckDir, 'deck.json'), 'utf8')));
      const ink = deck.slides[0].elements.filter((e) => e.type === 'shape' && e.ink);
      return ink.length ? ink : null;
    }, 'the kept ink never reached deck.json'))!;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ shape: 'path', stroke: '#ff2a2a', strokeWidth: 6, ink: true });
    // Its box spans the drag: a quarter to three quarters of the slide's width.
    expect(kept[0].x).toBeCloseTo(0.25 * 1920 - 3, -1);
    expect(kept[0].x + kept[0].w).toBeCloseTo(0.75 * 1920 + 3, -1);
    // The next show has it...
    const shows = async () => {
      audience = await present();
      return eventually(
        () => audience!.evaluate<boolean | null>(`document.querySelector('.stage [data-slide-id]')
          ? Boolean(document.querySelector('[data-element-id="${kept[0].id}"]')) : null`),
        'the audience window never rendered a slide',
        (value) => value !== null,
      );
    };
    expect(await shows()).toBe(true);
    await endShow();
    /** Where the editor paints the kept stroke, and whether it is visible there. */
    const editorShows = () => app!.cdp.evaluate<Record<string, boolean>>(`Object.fromEntries(
      ['#canvas', '#rail'].map((surface) => {
        const node = document.querySelector(surface + ' [data-element-id="${kept[0].id}"]');
        return [surface, Boolean(node) && getComputedStyle(node).display !== 'none'];
      }))`);
    expect(await editorShows()).toEqual({ '#canvas': true, '#rail': true });
    // ...and, with "Show saved ink" unchecked in the Present menu, neither the
    // show nor the editor does.
    await app.cdp.click('[aria-label="Presentation options"]');
    await app.cdp.clickByText('.shape-menu-item', 'Show saved ink');
    expect(await editorShows()).toEqual({ '#canvas': false, '#rail': false });
    // Opting into the laser trail in the same menu reaches the next show.
    await app.cdp.click('[aria-label="Presentation options"]');
    await app.cdp.clickByText('.shape-menu-item', 'Laser trail');
    expect(await shows()).toBe(false);
    expect(await audience!.evaluate<boolean>(`Boolean(document.querySelector('.laser-trail'))`)).toBe(true);
    await endShow();
    await app.cdp.click('[aria-label="Presentation options"]');
    expect(await app.cdp.evaluate<string | null>(`[...document.querySelectorAll('.shape-menu-item')]
      .find((item) => item.textContent === 'Show saved ink')?.getAttribute('aria-checked') ?? null`)).toBe('false');
    await app.cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await app.cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

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
