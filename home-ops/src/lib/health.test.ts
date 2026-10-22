import { describe, expect, it } from 'vitest';
import { computeHealth, sortTasksChronologically } from './health';
import type { MaintenanceTask, TaskStatus } from '../types';

const task = (dueDate: string, status: TaskStatus, title = dueDate): MaintenanceTask => ({
  id: `${title}-${status}`,
  userId: 'u',
  propertyId: null,
  title,
  season: 'Fall',
  dueDate,
  status,
  description: '',
  completedAt: null,
  seedKey: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('computeHealth', () => {
  const today = '2026-10-22';

  it('is 100 when nothing is due yet', () => {
    const h = computeHealth([task('2026-12-01', 'todo')], today);
    expect(h.score).toBe(100);
    expect(h.dueOrComplete).toBe(0);
  });

  it('counts completed vs overdue tasks and ignores future ones', () => {
    const h = computeHealth(
      [task('2026-09-01', 'complete'), task('2026-10-01', 'todo'), task('2026-10-22', 'in_progress'), task('2027-01-01', 'todo')],
      today,
    );
    expect(h.complete).toBe(1);
    expect(h.overdue).toBe(2);
    expect(h.score).toBe(33);
    expect(h.label).toBe('At risk');
  });

  it('rises when a task is completed', () => {
    const before = computeHealth([task('2026-10-01', 'todo'), task('2026-10-02', 'complete')], today);
    const after = computeHealth([task('2026-10-01', 'complete'), task('2026-10-02', 'complete')], today);
    expect(before.score).toBe(50);
    expect(after.score).toBe(100);
    expect(after.label).toBe('Excellent');
  });

  it('counts tasks due within 30 days as due soon', () => {
    expect(computeHealth([task('2026-11-10', 'todo'), task('2026-12-30', 'todo')], today).dueSoon).toBe(1);
  });
});

describe('sortTasksChronologically', () => {
  it('orders by due date then title without mutating input', () => {
    const input = [task('2026-11-01', 'todo', 'b'), task('2026-10-01', 'todo', 'z'), task('2026-11-01', 'todo', 'a')];
    const out = sortTasksChronologically(input);
    expect(out.map((t) => t.title)).toEqual(['z', 'a', 'b']);
    expect(input[0].title).toBe('b');
  });
});
