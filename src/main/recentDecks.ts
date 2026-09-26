import { access, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { RecentDeck } from '@shared/ipc.js';
import { DECK_FILE } from './deckStore.js';

/**
 * The "Open Recent" list: deck folders, most recent first, kept as a JSON
 * array in the app's user-data folder. Paths only — a deck's title lives in
 * its own deck.json and changes; the folder name is what VS Code shows too.
 */

const LIMIT = 10;

let writes: Promise<void> = Promise.resolve();

async function readDirs(file: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((dir): dir is string => typeof dir === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Move a deck to the top of the list. Writes are queued so two decks opened
 * together cannot each read the old list and drop the other's entry.
 */
export function rememberRecentDeck(file: string, dir: string): Promise<void> {
  const canonical = resolve(dir);
  writes = writes
    .then(async () => {
      const dirs = [canonical, ...(await readDirs(file)).filter((known) => known !== canonical)];
      await writeFile(file, JSON.stringify(dirs.slice(0, LIMIT), null, 2));
    })
    .catch((error: unknown) => console.error(`Could not update ${file}:`, error));
  return writes;
}

/**
 * The remembered decks that are still there. A missing one — an unplugged
 * drive, a folder since moved — is hidden rather than forgotten, so it comes
 * back when the drive does.
 */
export async function recentDecks(file: string): Promise<RecentDeck[]> {
  await writes;
  const dirs = await readDirs(file);
  const present = await Promise.all(
    dirs.map((dir) => access(join(dir, DECK_FILE)).then(() => true, () => false)),
  );
  return dirs.filter((_, index) => present[index]).map((dir) => ({ dir, name: basename(dir) }));
}
