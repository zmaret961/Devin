import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, occurrenceInSeasonYear, relativeDue, seasonForMonth, toISODate } from './dates';
import { warrantyState } from './warranty';
import { buildSeedTasks } from './seed';
import { SEED_TASKS } from '../data/seedTasks';
import { SEASONS } from '../types';

describe('dates', () => {
  it('formats local dates without UTC drift', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });

  it('maps months to seasons', () => {
    expect(seasonForMonth(1)).toBe('Winter');
    expect(seasonForMonth(4)).toBe('Spring');
    expect(seasonForMonth(7)).toBe('Summer');
    expect(seasonForMonth(10)).toBe('Fall');
    expect(seasonForMonth(12)).toBe('Winter');
  });

  it('describes due dates in plain language', () => {
    expect(relativeDue('2026-10-22', '2026-10-22')).toMatch(/today/i);
    expect(relativeDue('2026-10-23', '2026-10-22')).toMatch(/tomorrow/i);
    expect(relativeDue('2026-10-20', '2026-10-22')).toMatch(/overdue/i);
  });

  it('places seasonal occurrences within a year of the current season start', () => {
    const today = new Date(2026, 9, 22);
    const due = occurrenceInSeasonYear(4, 15, today);
    expect(due).toBe('2027-04-15');
  });
});

describe('warrantyState', () => {
  const today = '2026-10-22';
  it('classifies warranties', () => {
    expect(warrantyState(null, today)).toBe('none');
    expect(warrantyState('2026-01-01', today)).toBe('expired');
    expect(warrantyState('2026-12-01', today)).toBe('expiring');
    expect(warrantyState('2029-01-01', today)).toBe('active');
  });
});

describe('seed tasks', () => {
  it('covers all four seasons with unique keys and required examples', () => {
    const tasks = buildSeedTasks(new Date(2026, 9, 22), null);
    expect(new Set(tasks.map((t) => t.seedKey)).size).toBe(SEED_TASKS.length);
    for (const s of SEASONS) expect(tasks.some((t) => t.season === s)).toBe(true);
    const titles = tasks.map((t) => t.title.toLowerCase()).join('|');
    for (const needle of ['spigot', 'gutter', 'ac', 'roof']) expect(titles).toContain(needle);
    for (const t of tasks) expect(seasonForMonth(Number(t.dueDate.slice(5, 7)))).toBe(t.season);
  });
});
