import { useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { SEASONS, TASK_STATUSES, type MaintenanceTask, type Season, type TaskStatus } from '../../types';
import { useData } from '../../state/data';
import { computeHealth, sortTasksChronologically } from '../../lib/health';
import { parseISODate, relativeDue, toISODate } from '../../lib/dates';
import { STATUS_LABEL } from '../../lib/labels';
import { PageHeader } from '../../components/PageHeader';
import { Sheet } from '../../components/Sheet';
import { PrimaryButton } from '../../components/Fields';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { TaskCheck } from './TaskCheck';
import { TaskForm } from './TaskForm';

type StatusFilter = 'open' | 'all' | TaskStatus;
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

export function MaintenancePage() {
  const { tasks, load } = useData();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [season, setSeason] = useState<Season | 'all'>('all');
  const [editing, setEditing] = useState<MaintenanceTask | 'new' | null>(null);
  const today = toISODate(new Date());
  const health = computeHealth(tasks.items, today);

  const groups = useMemo(() => {
    const filtered = tasks.items.filter(
      (t) =>
        (season === 'all' || t.season === season) &&
        (statusFilter === 'all' || (statusFilter === 'open' ? t.status !== 'complete' : t.status === statusFilter)),
    );
    const byMonth = new Map<string, MaintenanceTask[]>();
    for (const t of sortTasksChronologically(filtered)) {
      const key = t.dueDate.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), t]);
    }
    return [...byMonth.entries()];
  }, [tasks.items, season, statusFilter]);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'open', label: 'Open' },
    ...TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    { value: 'all', label: 'All' },
  ];

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle={
          tasks.status === 'ready' ? (
            <span>
              Health Score <strong className="tabular-nums">{health.score}</strong>
              {health.overdue > 0 && <span className="text-brick"> · {health.overdue} overdue</span>}
            </span>
          ) : (
            'Your seasonal checklist'
          )
        }
        action={
          <PrimaryButton type="button" onClick={() => setEditing('new')} aria-label="Add a task">
            <Plus className="size-5" aria-hidden /> Add
          </PrimaryButton>
        }
      />

      <div className="mb-6 space-y-3">
        <ChipGroup label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        <ChipGroup
          label="Season"
          value={season}
          onChange={setSeason}
          options={[{ value: 'all' as const, label: 'All seasons' }, ...SEASONS.map((s) => ({ value: s, label: s }))]}
        />
      </div>

      {tasks.status === 'error' ? (
        <ErrorState message={tasks.error ?? 'Couldn\u2019t load your tasks.'} onRetry={() => load('tasks')} />
      ) : tasks.status !== 'ready' ? (
        <LoadingState rows={5} label="Loading tasks" />
      ) : groups.length === 0 ? (
        <EmptyState
          title={tasks.items.length ? 'Nothing matches these filters' : 'No tasks yet'}
          body={tasks.items.length ? 'Try another status or season.' : 'Add your first task to start tracking.'}
        />
      ) : (
        <div className="space-y-7">
          {groups.map(([month, list]) => (
            <section key={month} aria-label={monthFmt.format(parseISODate(`${month}-01`))}>
              <h2 className="mb-2 text-[0.8125rem] font-semibold tracking-[0.06em] text-muted uppercase">
                {monthFmt.format(parseISODate(`${month}-01`))}
              </h2>
              <ul className="card divide-y divide-line/80">
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onEdit={() => setEditing(t)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New task' : 'Edit task'}>
        {editing !== null && <TaskForm task={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function TaskRow({ task, today, onEdit }: { task: MaintenanceTask; today: string; onEdit: () => void }) {
  const setTaskStatus = useData((s) => s.setTaskStatus);
  const [open, setOpen] = useState(false);
  const done = task.status === 'complete';
  const overdue = !done && task.dueDate < today;
  const detailsId = `task-${task.id}`;
  return (
    <li className="py-1.5 pr-2 pl-2">
      <div className="flex items-center gap-2">
        <TaskCheck task={task} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-medium ${done ? 'text-muted line-through' : ''}`}>{task.title}</span>
            <span className={`block text-sm ${overdue ? 'font-medium text-brick' : 'text-muted'}`}>
              {done ? 'Done' : relativeDue(task.dueDate, today)}
              {task.status === 'in_progress' && <span className="text-pine"> · In progress</span>}
              <span className="text-muted"> · {task.season}</span>
            </span>
          </span>
          <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {open && (
        <div id={detailsId} className="pt-1 pr-2 pb-3 pl-[3.25rem]">
          {task.description && <p className="mb-3 leading-relaxed text-ink-2">{task.description}</p>}
          <div role="radiogroup" aria-label={`Status for ${task.title}`} className="mb-3 grid grid-cols-3 rounded-full bg-black/[0.05] p-1">
            {TASK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={task.status === s}
                onClick={() => void setTaskStatus(task.id, s)}
                className={`min-h-10 rounded-full text-sm font-semibold transition-colors ${
                  task.status === s ? 'bg-white text-ink shadow-sm' : 'text-ink-2'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <button type="button" onClick={onEdit} className="min-h-11 text-sm font-semibold text-pine">
            Edit or reschedule
          </button>
        </div>
      )}
    </li>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${
            value === o.value ? 'border-ink bg-ink text-white' : 'border-line-strong bg-card text-ink-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
