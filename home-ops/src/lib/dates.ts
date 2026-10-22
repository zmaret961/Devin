import type { ISODate, Season } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as `YYYY-MM-DD` (not UTC, so "today" matches the user's wall clock). */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Meteorological seasons, which is how US home checklists are usually grouped. */
export function seasonForMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Fall';
  return 'Winter';
}

const SEASON_START_MONTH: Record<Season, number> = { Spring: 3, Summer: 6, Fall: 9, Winter: 12 };

/** First day of the season `today` falls in. Winter starts Dec 1 of the previous year in Jan/Feb. */
export function currentSeasonStart(today: Date): Date {
  const month = today.getMonth() + 1;
  const season = seasonForMonth(month);
  const startMonth = SEASON_START_MONTH[season];
  const year = season === 'Winter' && month < 12 ? today.getFullYear() - 1 : today.getFullYear();
  return new Date(year, startMonth - 1, 1);
}

/**
 * Next occurrence of month/day inside the 12 months that begin with the
 * current season, so a fresh checklist covers one full year and the current
 * season's tasks show up (some possibly already overdue).
 */
export function occurrenceInSeasonYear(month: number, day: number, today: Date): ISODate {
  const start = currentSeasonStart(today);
  let candidate = new Date(start.getFullYear(), month - 1, day);
  if (candidate < start) candidate = new Date(start.getFullYear() + 1, month - 1, day);
  return toISODate(candidate);
}

const longFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function formatDate(value: ISODate | null | undefined, opts: { withYear?: boolean } = {}): string {
  if (!value) return '';
  const d = parseISODate(value);
  if (Number.isNaN(d.getTime())) return '';
  return (opts.withYear ? longFmt : shortFmt).format(d);
}

/** "Due today", "3 days overdue", "In 12 days". */
export function relativeDue(due: ISODate, today: ISODate): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff === -1) return '1 day overdue';
  if (diff < 0) return `${-diff} days overdue`;
  if (diff < 45) return `In ${diff} days`;
  return formatDate(due);
}
