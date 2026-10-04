import type { Footer } from '@shared/deck.js';
import type { EditorStore } from './store.js';

const NONE: Footer = { text: '', date: '', title: false, slideNumber: false, skipFirst: false };

/**
 * The deck-wide footer controls in the Design panel. Each field commits on
 * `change` as its own undo step; `sync` re-reads the deck after an undo or a
 * collaborator's edit, leaving a field that is being typed in alone.
 */
export function footerControls(store: EditorStore): { element: HTMLElement; sync(): void } {
  const element = document.createElement('div');
  element.className = 'footer-controls';

  const set = (patch: Partial<Footer>, label: string): void => {
    store.commit((deck) => {
      const next = { ...NONE, ...deck.footer, ...patch };
      const empty = !next.text && !next.date && !next.title && !next.slideNumber;
      deck.footer = empty ? null : next;
    }, { label });
  };

  const texts = (['text', 'date'] as const).map((key) => {
    const row = document.createElement('label');
    row.className = 'field';
    const name = document.createElement('span');
    name.textContent = key === 'text' ? 'Text' : 'Date';
    const input = document.createElement('input');
    input.type = 'text';
    input.addEventListener('change', () => set({ [key]: input.value }, `Change footer ${key}`));
    row.append(name, input);
    element.appendChild(row);
    return { key, input };
  });

  const checks = ([
    ['title', 'Deck title'],
    ['slideNumber', 'Slide number'],
    ['skipFirst', 'Hide on first slide'],
  ] as const).map(([key, label]) => {
    const row = document.createElement('label');
    row.className = 'field field-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => set(
      { [key]: input.checked },
      `${input.checked ? 'Show' : 'Hide'} footer ${label.toLowerCase()}`,
    ));
    const name = document.createElement('span');
    name.textContent = label;
    row.append(input, name);
    element.appendChild(row);
    return { key, input };
  });

  const sync = (): void => {
    const footer = store.get().deck.footer;
    const current = { ...NONE, ...footer };
    for (const { key, input } of texts) {
      if (document.activeElement !== input) input.value = current[key];
    }
    for (const { key, input } of checks) {
      input.checked = current[key];
      // Nothing to hide on the first slide until the footer shows something.
      if (key === 'skipFirst') input.disabled = !footer;
    }
  };
  sync();
  return { element, sync };
}
