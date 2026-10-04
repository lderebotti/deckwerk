import { FOOTER_DATE_FORMATS, type Footer, type FooterDate } from '@shared/deck.js';
import { formatDay, localDay, parseDmy } from '@shared/footer.js';
import type { EditorStore } from './store.js';

const CALENDAR_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">'
  + '<rect x="1.5" y="2.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>'
  + '<path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

const NONE: Footer = { text: '', date: null, title: false, slideNumber: false, skipFirst: false };

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
  const field = (label: string, control: HTMLElement): HTMLLabelElement => {
    const row = document.createElement('label');
    row.className = 'field';
    const name = document.createElement('span');
    name.textContent = label;
    row.append(name, control);
    element.appendChild(row);
    return row;
  };
  const select = (options: Array<[string, string]>): HTMLSelectElement => {
    const control = document.createElement('select');
    for (const [value, text] of options) control.add(new Option(text, value));
    return control;
  };

  const text = document.createElement('input');
  text.type = 'text';
  text.addEventListener('change', () => set({ text: text.value }, 'Change footer text'));
  field('Text', text);

  const currentDate = (): FooterDate | null => store.get().deck.footer?.date ?? null;
  const setDate = (date: FooterDate | null): void => set({ date }, 'Change footer date');

  const mode = select([['none', 'None'], ['today', 'Today (updates)'], ['fixed', 'Fixed date']]);
  mode.addEventListener('change', () => {
    const format = currentDate()?.format ?? 'long';
    if (mode.value === 'none') setDate(null);
    // A fixed date starts on today, so the footer shows something at once.
    else if (mode.value === 'fixed') setDate({ mode: 'fixed', value: currentDate()?.value || localDay(new Date()), format });
    else setDate({ mode: 'today', value: currentDate()?.value ?? '', format });
  });
  field('Date', mode);

  // Typed as dd/mm/yyyy. Chromium's own date field orders the day by the
  // app's locale (en-US, so month first) and cannot be told otherwise, so it
  // stays hidden and only lends its calendar to the button.
  const day = document.createElement('input');
  day.type = 'text';
  day.placeholder = 'dd/mm/yyyy';
  day.addEventListener('change', () => {
    const date = currentDate();
    const value = parseDmy(day.value);
    if (date && value && value !== date.value) setDate({ ...date, value });
    // Shown back as dd/mm/yyyy, or as the deck's day when the text is no day.
    const shown = currentDate()?.value;
    day.value = shown ? formatDay(shown, 'dmy') : '';
  });
  const picker = document.createElement('input');
  picker.type = 'date';
  picker.className = 'field-date-picker';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  picker.addEventListener('change', () => {
    const date = currentDate();
    if (date && picker.value) setDate({ ...date, value: picker.value });
  });
  const calendar = document.createElement('button');
  calendar.type = 'button';
  calendar.className = 'field-date-button';
  calendar.title = 'Choose from calendar';
  calendar.setAttribute('aria-label', 'Choose from calendar');
  calendar.innerHTML = CALENDAR_ICON;
  calendar.addEventListener('click', (event) => {
    event.preventDefault();
    picker.showPicker?.();
  });
  const dayWrap = document.createElement('span');
  dayWrap.className = 'field-unit-wrap field-date';
  dayWrap.append(day, picker, calendar);
  const dayRow = field('Day', dayWrap);

  const format = select(FOOTER_DATE_FORMATS.map((value) => [value, value]));
  format.addEventListener('change', () => {
    const date = currentDate();
    if (date) setDate({ ...date, format: format.value as FooterDate['format'] });
  });
  const formatRow = field('Format', format);

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
    if (document.activeElement !== text) text.value = current.text;
    const date = current.date;
    mode.value = date?.mode ?? 'none';
    dayRow.hidden = date?.mode !== 'fixed';
    if (document.activeElement !== day) day.value = date?.value ? formatDay(date.value, 'dmy') : '';
    picker.value = date?.value ?? '';
    formatRow.hidden = !date;
    // Each format is shown as the day it would print.
    const sample = date?.mode === 'fixed' && date.value ? date.value : localDay(new Date());
    for (const option of format.options) option.text = formatDay(sample, option.value as FooterDate['format']);
    format.value = date?.format ?? 'long';
    for (const { key, input } of checks) {
      input.checked = current[key];
      // Nothing to hide on the first slide until the footer shows something.
      if (key === 'skipFirst') input.disabled = !footer;
    }
  };
  sync();
  return { element, sync };
}
