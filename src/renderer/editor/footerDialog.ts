import type { Footer } from '@shared/deck.js';
import type { EditorStore } from './store.js';

const NONE: Footer = { text: '', date: '', title: false, slideNumber: false, skipFirst: false };

/** Edit the deck-wide footer (text, date, title, slide number). */
export function showFooterDialog(store: EditorStore): void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const footer: Footer = { ...NONE, ...store.get().deck.footer };

  const overlay = document.createElement('div');
  overlay.className = 'workflow-overlay';
  const dialog = document.createElement('section');
  dialog.className = 'workflow-dialog footer-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'footer-title');

  const heading = document.createElement('h2');
  heading.id = 'footer-title';
  heading.textContent = 'Footer';

  const textField = (label: string, key: 'text' | 'date'): HTMLLabelElement => {
    const row = document.createElement('label');
    row.className = 'field';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = footer[key];
    input.addEventListener('input', () => { footer[key] = input.value; });
    row.append(name, input);
    return row;
  };
  const checkField = (label: string, key: 'title' | 'slideNumber' | 'skipFirst'): HTMLLabelElement => {
    const row = document.createElement('label');
    row.className = 'field field-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = footer[key];
    input.addEventListener('change', () => { footer[key] = input.checked; });
    const name = document.createElement('span');
    name.textContent = label;
    row.append(input, name);
    return row;
  };

  const actions = document.createElement('div');
  actions.className = 'workflow-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'primary';
  apply.textContent = 'Apply';
  actions.append(cancel, apply);

  const close = (): void => { overlay.remove(); previousFocus?.focus(); };
  cancel.addEventListener('click', close);
  apply.addEventListener('click', () => {
    const empty = !footer.text && !footer.date && !footer.title && !footer.slideNumber;
    store.commit((deck) => { deck.footer = empty ? null : { ...footer }; }, { label: 'Change footer' });
    close();
  });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  dialog.append(
    heading,
    textField('Text', 'text'),
    textField('Date', 'date'),
    checkField('Deck title', 'title'),
    checkField('Slide number', 'slideNumber'),
    checkField('Hide on first slide', 'skipFirst'),
    actions,
  );
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  dialog.querySelector('input')?.focus();
}
