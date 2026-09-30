import { type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { emptyDeck } from '../src/shared/deck.js';
import { Cdp, electronBinary, eventually, findTarget, stopBrowser } from './support/browserSession.js';
import { isEditorTarget, launchDesktopApp, materializeDesktopApp } from './support/desktopApp.js';

/**
 * Export PNG through the real app: one canvas-sized image per slide, named in
 * rail order, and only the slides asked for when a subset is given.
 */

const runnable = Boolean(electronBinary) && process.platform !== 'win32';

let workDir = '';
let appProcess: ChildProcess | null = null;
let editor: Cdp | null = null;
let dialogQueue = '';

function pngSize(png: Buffer): { w: number; h: number } {
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

async function exportPng(outDir: string, request: object): Promise<string | null> {
  await writeFile(dialogQueue, JSON.stringify([{ filePaths: [outDir] }]), 'utf8');
  return editor!.evaluate<string | null>(`window.api.exportPng(${JSON.stringify(request)})`);
}

describe.skipIf(!runnable)('PNG export', () => {
  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'png-export-'));
    const appDir = join(workDir, 'app');
    const profileDir = join(workDir, 'electron-profile');
    const deckDir = join(workDir, 'deck');
    await mkdir(appDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await materializeDesktopApp(appDir, 'deckwerk-png-export-test');

    const deck = emptyDeck('PNG export');
    const template = deck.slides[0];
    deck.slides = ['#ff0000', '#00ff00', '#0000ff'].map((color, index) => ({
      ...structuredClone(template),
      id: `slide-${index + 1}`,
      background: { color, image: null },
    }));
    await saveDeck(deckDir, deck);

    dialogQueue = join(workDir, 'dialogs.json');
    await writeFile(dialogQueue, '[]', 'utf8');
    const app = await launchDesktopApp(appDir, [deckDir], {
      profileDir, cwd: appDir, env: { DECKWERK_TEST_DIALOGS: dialogQueue },
    });
    appProcess = app.process;
    const target = await findTarget(app.debugPort, isEditorTarget, app.log, 30_000);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    await eventually(
      () => editor!.evaluate<boolean>('window.api.getDeck().then((s) => Boolean(s))'),
      'the editor never opened the deck',
    );
  }, 90_000);

  afterAll(async () => {
    editor?.close();
    await stopBrowser(appProcess);
    if (workDir) await rm(workDir, { recursive: true, force: true, maxRetries: 5 });
  });

  it('writes every slide at canvas size, in rail order', async () => {
    const outDir = join(workDir, 'all');
    await mkdir(outDir);
    expect(await exportPng(outDir, {})).toBe(outDir);
    expect((await readdir(outDir)).sort()).toEqual(['slide-1.png', 'slide-2.png', 'slide-3.png']);
    const images = await Promise.all([1, 2, 3].map((n) => readFile(join(outDir, `slide-${n}.png`))));
    for (const png of images) expect(pngSize(png)).toEqual({ w: 1920, h: 1080 });
    // Differently coloured slides: each capture shows its own page.
    expect(new Set(images.map((png) => png.toString('base64'))).size).toBe(3);
  }, 60_000);

  it('writes only the slides asked for', async () => {
    const outDir = join(workDir, 'some');
    await mkdir(outDir);
    await exportPng(outDir, { slideIds: ['slide-2'] });
    expect(await readdir(outDir)).toEqual(['slide-2.png']);
  }, 60_000);

  it('still exports a PDF through the shared print window', async () => {
    const target = join(workDir, 'deck.pdf');
    await writeFile(dialogQueue, JSON.stringify([{ filePath: target }]), 'utf8');
    expect(await editor!.evaluate<string | null>('window.api.exportPdf({})')).toBe(target);
    expect((await readFile(target)).subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
});
