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
      deck.footer = { text: 'ACME', date: '', title: false, slideNumber: false, skipFirst: false };
    });
    change(hideFooter()!, true);
    expect(store.get().deck.slides[0].hideFooter).toBe(true);
    change(hideFooter()!, false);
    expect(store.get().deck.slides[0]).not.toHaveProperty('hideFooter');
  });
});
