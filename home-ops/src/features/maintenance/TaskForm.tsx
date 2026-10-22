import { useState, type FormEvent } from 'react';
import { SEASONS, TASK_STATUSES, type MaintenanceTask, type Season, type TaskStatus } from '../../types';
import { useData } from '../../state/data';
import { seasonForMonth, toISODate } from '../../lib/dates';
import { STATUS_LABEL } from '../../lib/labels';
import { toServiceError } from '../../services';
import { PrimaryButton, SecondaryButton, SelectField, TextAreaField, TextField } from '../../components/Fields';

export function TaskForm({ task, onDone }: { task: MaintenanceTask | null; onDone: () => void }) {
  const { saveTask, removeTask, properties } = useData();
  const today = toISODate(new Date());
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? today);
  const [season, setSeason] = useState<Season>(task?.season ?? seasonForMonth(new Date().getMonth() + 1));
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [description, setDescription] = useState(task?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Give the task a title.');
    if (!dueDate) return setError('Pick a due date.');
    setBusy(true);
    setError(null);
    try {
      await saveTask({ id: task?.id, propertyId: task?.propertyId ?? properties.items[0]?.id ?? null, title, dueDate, season, status, description });
      onDone();
    } catch (err) {
      setError(toServiceError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Task" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus={!task} />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            if (e.target.value && !task) setSeason(seasonForMonth(Number(e.target.value.slice(5, 7))));
          }}
        />
        <SelectField label="Season" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
          {SEASONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </SelectField>
      </div>
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </SelectField>
      <TextAreaField label="How to do it" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && (
        <p role="alert" className="text-sm text-brick">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <PrimaryButton type="submit" disabled={busy} className="flex-1">
          {busy ? 'Saving…' : 'Save task'}
        </PrimaryButton>
        {task && (
          <SecondaryButton
            type="button"
            className="text-brick"
            onClick={async () => {
              if (!window.confirm(`Delete "${task.title}"?`)) return;
              await removeTask(task.id).then(onDone, () => undefined);
            }}
          >
            Delete
          </SecondaryButton>
        )}
      </div>
    </form>
  );
}
