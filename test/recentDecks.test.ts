import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recentDecks, rememberRecentDeck } from '../src/main/recentDecks.js';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function deckFolder(name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'deck.json'), '{}');
  return dir;
}

describe('recent decks', () => {
  it('lists most recent first, once each, and hides decks that are gone', async () => {
    root = await mkdtemp(join(tmpdir(), 'recent-decks-'));
    const file = join(root, 'recent-decks.json');
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map(deckFolder));

    // Not awaited one by one: concurrent opens must not drop each other.
    await Promise.all([rememberRecentDeck(file, a), rememberRecentDeck(file, b), rememberRecentDeck(file, c)]);
    await rememberRecentDeck(file, `${a}/`);
    expect(await recentDecks(file)).toEqual([
      { dir: a, name: 'a' },
      { dir: c, name: 'c' },
      { dir: b, name: 'b' },
    ]);

    await rm(c, { recursive: true });
    expect((await recentDecks(file)).map((deck) => deck.name)).toEqual(['a', 'b']);
    // Hidden, not forgotten: it returns if the folder does.
    expect(JSON.parse(await readFile(file, 'utf8'))).toContain(c);
  });

  it('keeps ten and survives a missing or corrupt file', async () => {
    root = await mkdtemp(join(tmpdir(), 'recent-decks-'));
    const file = join(root, 'recent-decks.json');
    expect(await recentDecks(file)).toEqual([]);
    await writeFile(file, 'not json');
    expect(await recentDecks(file)).toEqual([]);

    for (let i = 0; i < 12; i++) await rememberRecentDeck(file, await deckFolder(`d${i}`));
    const names = (await recentDecks(file)).map((deck) => deck.name);
    expect(names).toHaveLength(10);
    expect(names[0]).toBe('d11');
    // Written via a temporary file and a rename; none is left behind.
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
