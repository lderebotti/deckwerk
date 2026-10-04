import { describe, expect, it } from 'vitest';
import { DeckSchema } from '../src/shared/deck';
import { footerFor, formatDay, parseDmy } from '../src/shared/footer';

describe('footerFor', () => {
  const deck = DeckSchema.parse({
    version: 1,
    title: 'Talk',
    footer: {
      text: 'ACME',
      date: { mode: 'fixed', value: '2026-10-03', format: 'long' },
      title: true,
      slideNumber: true,
      skipFirst: true,
    },
  });
  it('fills the three slots and skips the first slide', () => {
    expect(footerFor(deck, 0)).toBeNull();
    expect(footerFor(deck, 2)).toEqual({ left: 'ACME  ·  3 October 2026', center: 'Talk', right: '3' });
  });
  it('shows nothing by default', () => {
    expect(footerFor(DeckSchema.parse({ version: 1 }), 1)).toBeNull();
  });
});

describe('the footer date', () => {
  it('prints a day in every format, the same in any time zone', () => {
    expect(['long', 'us', 'dmy', 'mdy', 'iso', 'month'].map((format) => formatDay('2026-10-03', format as never)))
      .toEqual(['3 October 2026', 'October 3, 2026', '03/10/2026', '10/03/2026', '2026-10-03', 'October 2026']);
    expect(formatDay('not a day', 'long')).toBe('');
    expect(formatDay('2026-02-31', 'long')).toBe('');
  });

  it('reads a day typed day first', () => {
    expect(parseDmy('3/10/2026')).toBe('2026-10-03');
    expect(parseDmy(' 03.10.2026 ')).toBe('2026-10-03');
    expect(parseDmy('29-02-2028')).toBe('2028-02-29');
    expect(parseDmy('29/02/2026')).toBeNull();
    expect(parseDmy('10/2026')).toBeNull();
  });

  it('follows the day the slide is drawn in Today mode', () => {
    const deck = DeckSchema.parse({ version: 1, footer: { date: { mode: 'today', format: 'iso' } } });
    expect(footerFor(deck, 0, new Date(2027, 0, 9, 23, 30))?.left).toBe('2027-01-09');
  });

  it('drops a free-text date from an earlier footer instead of failing the deck', () => {
    const deck = DeckSchema.parse({ version: 1, footer: { text: 'ACME', date: 'Fall 2026' } });
    expect(deck.footer?.date).toBeNull();
    expect(footerFor(deck, 0)?.left).toBe('ACME');
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
