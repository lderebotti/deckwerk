import type { Deck } from './deck.js';

export interface FooterText { left: string; center: string; right: string }

/** What slide `index` shows in its footer, or null when it shows none. */
export function footerFor(deck: Deck, index: number): FooterText | null {
  const f = deck.footer;
  if (!f || (f.skipFirst && index === 0) || deck.slides[index]?.hideFooter) return null;
  const left = [f.text, f.date].filter(Boolean).join('  ·  ');
  const center = f.title ? deck.title : '';
  const right = f.slideNumber ? String(index + 1) : '';
  return left || center || right ? { left, center, right } : null;
}
