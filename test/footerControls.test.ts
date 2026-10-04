// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDeck } from '../src/shared/deck.js';
import { footerControls } from '../src/renderer/editor/footerSection.js';
import { Inspector } from '../src/renderer/editor/inspector.js';
import { EditorStore } from '../src/renderer/editor/store.js';

function field(host: HTMLElement, label: string): HTMLInputElement {
  const row = [...host.querySelectorAll<HTMLElement>('.field')]
    .find((candidate) => candidate.querySelector('span')?.textContent === label);
  if (!row) throw new Error(`no field ${label}`);
  return row.querySelector('input')!;
}

function change(input: HTMLInputElement, value: string | boolean): void {
  if (typeof value === 'boolean') input.checked = value;
  else input.value = value;
  input.dispatchEvent(new Event('change'));
}

describe('footer controls in Design', () => {
  beforeEach(() => document.body.replaceChildren());

  it('commits each field as one undo step and follows undo', () => {
    const store = new EditorStore(emptyDeck('Talk'), '/tmp/footer');
    const footer = footerControls(store);
    store.subscribe(() => footer.sync());
    document.body.appendChild(footer.element);

    // Nothing to hide on the first slide while the footer is empty.
    expect(field(footer.element, 'Hide on first slide').disabled).toBe(true);

    change(field(footer.element, 'Text'), 'ACME');
    change(field(footer.element, 'Slide number'), true);
    expect(store.get().deck.footer).toMatchObject({ text: 'ACME', slideNumber: true });
    expect(field(footer.element, 'Hide on first slide').disabled).toBe(false);

    store.undo();
    expect(field(footer.element, 'Slide number').checked).toBe(false);
    store.undo();
    expect(store.get().deck.footer).toBeNull();
    expect(field(footer.element, 'Text').value).toBe('');
  });
});

describe('the footer date in Design', () => {
  beforeEach(() => document.body.replaceChildren());

  const row = (host: HTMLElement, label: string): HTMLElement => [...host.querySelectorAll<HTMLElement>('.field')]
    .find((candidate) => candidate.querySelector('span')?.textContent === label)!;

  it('picks a fixed day from the calendar field and offers each format as that day', () => {
    const store = new EditorStore(emptyDeck('Talk'), '/tmp/footer');
    const footer = footerControls(store);
    store.subscribe(() => footer.sync());
    const mode = row(footer.element, 'Date').querySelector('select')!;
    expect(mode.value).toBe('none');
    expect(row(footer.element, 'Day').hidden).toBe(true);
    expect(row(footer.element, 'Format').hidden).toBe(true);

    mode.value = 'fixed';
    mode.dispatchEvent(new Event('change'));
    expect(row(footer.element, 'Format').hidden).toBe(false);
    const day = row(footer.element, 'Day').querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(day.placeholder).toBe('dd/mm/yyyy');
    expect(row(footer.element, 'Day').hidden).toBe(false);
    expect(row(footer.element, 'Day').querySelector('button[aria-label="Choose from calendar"]')).not.toBeNull();
    expect(store.get().deck.footer?.date?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    change(day, '3/10/2026');
    expect(store.get().deck.footer?.date?.value).toBe('2026-10-03');
    expect(day.value).toBe('03/10/2026');
    // A day that does not exist is refused and the field shows the deck's again.
    change(day, '31/02/2026');
    expect(store.get().deck.footer?.date?.value).toBe('2026-10-03');
    expect(day.value).toBe('03/10/2026');
    // The calendar's own field speaks ISO.
    change(row(footer.element, 'Day').querySelector<HTMLInputElement>('input[type="date"]')!, '2026-12-25');
    expect(day.value).toBe('25/12/2026');
    change(day, '03/10/2026');
    const format = row(footer.element, 'Format').querySelector('select')!;
    expect([...format.options].map((option) => option.text)).toEqual([
      '3 October 2026', 'October 3, 2026', '03/10/2026', '10/03/2026', '2026-10-03', 'October 2026',
    ]);
    format.value = 'iso';
    format.dispatchEvent(new Event('change'));
    expect(store.get().deck.footer?.date).toEqual({ mode: 'fixed', value: '2026-10-03', format: 'iso' });

    mode.value = 'today';
    mode.dispatchEvent(new Event('change'));
    expect(store.get().deck.footer?.date).toMatchObject({ mode: 'today', format: 'iso' });
    expect(row(footer.element, 'Day').hidden).toBe(true);

    mode.value = 'none';
    mode.dispatchEvent(new Event('change'));
    expect(row(footer.element, 'Format').hidden).toBe(true);
    // Nothing else was on, so the footer is gone altogether.
    expect(store.get().deck.footer).toBeNull();
  });
});

describe('hiding the footer from Props', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: Window }).window.api = { assetUrl: (src: string) => src } as never;
    if (!('ResizeObserver' in globalThis)) {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      };
    }
    document.body.replaceChildren();
  });

  it('is offered only while the deck has a footer, and toggles the current slide', () => {
    const store = new EditorStore(emptyDeck('Talk'), '/tmp/footer');
    const host = document.createElement('aside');
    document.body.appendChild(host);
    new Inspector(host, store);
    const hideFooter = () => [...host.querySelectorAll<HTMLElement>('.slide-layout-options .field-check')]
      .find((row) => row.textContent === 'Hide footer')?.querySelector('input') ?? null;

    expect(hideFooter()).toBeNull();
    store.commit((deck) => {
      deck.footer = { text: 'ACME', date: null, title: false, slideNumber: false, skipFirst: false };
    });
    change(hideFooter()!, true);
    expect(store.get().deck.slides[0].hideFooter).toBe(true);
    change(hideFooter()!, false);
    expect(store.get().deck.slides[0]).not.toHaveProperty('hideFooter');
  });
});
