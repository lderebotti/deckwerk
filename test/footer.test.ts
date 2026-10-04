import { describe, expect, it } from 'vitest';
import { DeckSchema } from '../src/shared/deck';
import { footerFor } from '../src/shared/footer';

describe('footerFor', () => {
  const deck = DeckSchema.parse({ version: 1, title: 'Talk', footer: { text: 'ACME', date: '2026', title: true, slideNumber: true, skipFirst: true } });
  it('fills the three slots and skips the first slide', () => {
    expect(footerFor(deck, 0)).toBeNull();
    expect(footerFor(deck, 2)).toEqual({ left: 'ACME  ·  2026', center: 'Talk', right: '3' });
  });
  it('shows nothing by default', () => {
    expect(footerFor(DeckSchema.parse({ version: 1 }), 1)).toBeNull();
  });
});

describe('hiding the footer on one slide', () => {
  it('leaves that slide bare and keeps the others numbered by position', () => {
    const deck = DeckSchema.parse({
      version: 1,
      footer: { slideNumber: true },
      slides: [{ id: 'a' }, { id: 'b', hideFooter: true }, { id: 'c' }],
    });
    expect(footerFor(deck, 1)).toBeNull();
    expect(footerFor(deck, 2)?.right).toBe('3');
  });
});
