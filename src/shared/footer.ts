import type { Deck, FooterDate } from './deck.js';

export interface FooterText { left: string; center: string; right: string }

type DateFormat = FooterDate['format'];

/**
 * Each format names its locale, so a deck reads the same on every machine
 * that presents or exports it. Dates are formatted as UTC calendar days: a
 * `YYYY-MM-DD` is a day, not an instant, and must not shift with the zone.
 */
const DATE_FORMATS: Record<DateFormat, (day: Date) => string> = {
  long: (day) => day.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }),
  us: (day) => day.toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }),
  dmy: (day) => day.toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }),
  mdy: (day) => day.toLocaleDateString('en-US', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }),
  iso: (day) => day.toISOString().slice(0, 10),
  month: (day) => day.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
};

/** The local calendar day of `now`, as `YYYY-MM-DD`. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `day` (`YYYY-MM-DD`) in `format`, or '' when it is not a valid day. */
export function formatDay(day: string, format: DateFormat): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMATS[format](date);
}

/** What the footer's date reads on `now`. */
export function footerDateText(date: FooterDate | null, now = new Date()): string {
  if (!date) return '';
  return formatDay(date.mode === 'today' ? localDay(now) : date.value, date.format);
}

/** What slide `index` shows in its footer, or null when it shows none. */
export function footerFor(deck: Deck, index: number, now = new Date()): FooterText | null {
  const f = deck.footer;
  if (!f || (f.skipFirst && index === 0) || deck.slides[index]?.hideFooter) return null;
  const left = [f.text, footerDateText(f.date, now)].filter(Boolean).join('  ·  ');
  const center = f.title ? deck.title : '';
  const right = f.slideNumber ? String(index + 1) : '';
  return left || center || right ? { left, center, right } : null;
}
