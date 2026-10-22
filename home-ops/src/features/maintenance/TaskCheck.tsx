import { Check } from 'lucide-react';
import type { MaintenanceTask } from '../../types';
import { useData } from '../../state/data';

/** Large round checkbox. Ticking marks a task done; unticking puts it back to "To do". */
export function TaskCheck({ task }: { task: MaintenanceTask }) {
  const setTaskStatus = useData((s) => s.setTaskStatus);
  const done = task.status === 'complete';
  const partial = task.status === 'in_progress';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done ? true : partial ? 'mixed' : false}
      aria-label={`${task.title}: ${done ? 'done' : partial ? 'in progress' : 'not done'}`}
      onClick={(e) => {
        e.stopPropagation();
        void setTaskStatus(task.id, done ? 'todo' : 'complete');
      }}
      className="interactive grid size-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={`grid size-7 place-items-center rounded-full border-2 transition-colors ${
          done ? 'border-pine bg-pine text-white' : partial ? 'border-pine' : 'border-line-strong bg-white'
        }`}
      >
        {done ? (
          <Check className="size-4" strokeWidth={3} aria-hidden />
        ) : partial ? (
          <span className="size-3 rounded-full bg-pine" aria-hidden />
        ) : null}
      </span>
    </button>
  );
}
