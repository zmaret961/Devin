import type { ISODate, MaintenanceTask } from '../types';
import { addDays } from './dates';

export interface HealthSummary {
  /** 0–100. Share of tasks that are due (or already done) which are complete. */
  score: number;
  /** Tasks due on or before today, plus anything completed early. */
  dueOrComplete: number;
  complete: number;
  overdue: number;
  dueSoon: number;
  label: 'Excellent' | 'Good' | 'Needs attention' | 'At risk';
}

/**
 * Maintenance Health Score = completed / (completed + not-yet-complete tasks
 * whose due date has passed). Future tasks don't count against you until
 * they're due. With nothing due yet the home is at 100.
 */
export function computeHealth(tasks: readonly MaintenanceTask[], today: ISODate): HealthSummary {
  const soon = addDays(today, 30);
  let complete = 0;
  let overdue = 0;
  let dueSoon = 0;
  for (const t of tasks) {
    if (t.status === 'complete') complete += 1;
    else if (t.dueDate <= today) overdue += 1;
    else if (t.dueDate <= soon) dueSoon += 1;
  }
  const dueOrComplete = complete + overdue;
  const score = dueOrComplete === 0 ? 100 : Math.round((complete / dueOrComplete) * 100);
  const label = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 40 ? 'Needs attention' : 'At risk';
  return { score, dueOrComplete, complete, overdue, dueSoon, label };
}

export function sortTasksChronologically<T extends Pick<MaintenanceTask, 'dueDate' | 'title'>>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}
